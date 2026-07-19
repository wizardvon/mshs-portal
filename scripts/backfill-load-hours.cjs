const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const FIREBASE_CLI_CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLI_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";
const COLLECTIONS = ["subjects", "loadAssignments", "ancillaryLoads"];
const shouldApply = process.argv.includes("--apply");

function getProjectId() {
  const firebaseRc = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".firebaserc"), "utf8"));
  return firebaseRc.projects?.default;
}

function getConfigstorePath() {
  return path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
}

function findRefreshToken(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.refresh_token === "string") return value.refresh_token;
  if (typeof value.refreshToken === "string") return value.refreshToken;

  for (const child of Object.values(value)) {
    const token = findRefreshToken(child);
    if (token) return token;
  }

  return "";
}

async function getAccessToken() {
  const config = JSON.parse(fs.readFileSync(getConfigstorePath(), "utf8"));
  const refreshToken = findRefreshToken(config);

  if (!refreshToken) {
    throw new Error("Could not find a Firebase CLI refresh token. Run `firebase login` first.");
  }

  const response = await fetch("https://www.googleapis.com/oauth2/v3/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: FIREBASE_CLI_CLIENT_ID,
      client_secret: FIREBASE_CLI_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Unable to refresh Firebase CLI access token: ${response.status} ${await response.text()}`);
  }

  const token = await response.json();
  return token.access_token;
}

function getNumberField(fields, key) {
  const value = fields?.[key];
  if (!value) return null;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return Number(value.doubleValue);
  return null;
}

function toFirestoreNumber(value) {
  return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
}

async function listCollection({ accessToken, projectId, collectionId }) {
  const documents = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}`,
    );
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Read failed for ${collectionId}: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    documents.push(...(Array.isArray(data.documents) ? data.documents : []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return documents;
}

async function patchLoadHours({ accessToken, documentName, loadHours }) {
  const url = new URL(`https://firestore.googleapis.com/v1/${documentName}`);
  url.searchParams.set("updateMask.fieldPaths", "loadHours");

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        loadHours: toFirestoreNumber(loadHours),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Patch failed for ${documentName}: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const projectId = getProjectId();
  if (!projectId) throw new Error("Could not find default Firebase project in .firebaserc.");

  const accessToken = await getAccessToken();
  console.log(`${shouldApply ? "Applying" : "Dry run"} loadHours backfill for ${projectId}.`);

  for (const collectionId of COLLECTIONS) {
    const documents = await listCollection({ accessToken, projectId, collectionId });
    const candidates = documents
      .map((document) => ({
        name: document.name,
        units: getNumberField(document.fields, "units"),
        loadHours: getNumberField(document.fields, "loadHours"),
      }))
      .filter((document) => document.loadHours === null && document.units !== null);

    console.log(`${collectionId}: ${documents.length} read, ${candidates.length} need loadHours.`);

    if (shouldApply) {
      for (const document of candidates) {
        await patchLoadHours({
          accessToken,
          documentName: document.name,
          loadHours: document.units,
        });
      }
      console.log(`${collectionId}: ${candidates.length} updated.`);
    }
  }

  if (!shouldApply) {
    console.log("No data was changed. Run `node scripts/backfill-load-hours.cjs --apply` after backup to write loadHours.");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
