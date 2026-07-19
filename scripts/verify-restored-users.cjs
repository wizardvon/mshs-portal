const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PROJECT_ID = "mshs-portal-be381";

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
      client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
      client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
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

async function main() {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users?pageSize=100`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Verification read failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const documents = Array.isArray(data.documents) ? data.documents : [];
  console.log(`Verified ${documents.length} user profile document(s) in Firestore.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
