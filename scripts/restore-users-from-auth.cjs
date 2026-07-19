const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PROJECT_ID = "mshs-portal-be381";
const EXPORT_FILE = path.resolve(process.cwd(), "firebase-auth-users.json");
const BOOTSTRAP_UID = "fTHaa7C31vSL8XZuPeXbEEtc23F3";
const BOOTSTRAP_EMAIL = "wizardvon@gmail.com";

const allAppModuleIds = [
  "dashboard",
  "loading",
  "teachers",
  "subjects",
  "sections",
  "curriculum_mapping",
  "load_assignment",
  "scheduler",
  "dll_submissions",
  "mps",
  "observations",
  "personnel_attendance",
  "my_personnel_attendance",
  "teacher_loads",
  "reports",
  "personnel_settings",
  "settings",
  "backup_restore",
  "users",
];

const defaultModulePermissionsByRole = {
  super_admin: allAppModuleIds,
  admin: [
    "dashboard",
    "loading",
    "teachers",
    "subjects",
    "sections",
    "curriculum_mapping",
    "load_assignment",
    "scheduler",
    "dll_submissions",
    "mps",
    "observations",
    "personnel_attendance",
    "teacher_loads",
    "reports",
    "personnel_settings",
    "settings",
    "backup_restore",
  ],
  principal: ["dashboard", "loading", "scheduler", "dll_submissions", "mps", "observations", "my_personnel_attendance", "teacher_loads", "reports", "personnel_settings"],
  master_teacher: ["dashboard", "loading", "teachers", "subjects", "sections", "dll_submissions", "mps", "observations", "my_personnel_attendance", "teacher_loads", "reports", "personnel_settings"],
  teacher: ["dashboard", "loading", "dll_submissions", "mps", "observations", "my_personnel_attendance", "teacher_loads", "reports", "personnel_settings"],
  registrar: ["dashboard", "sections", "reports", "personnel_settings"],
  administrative_officer: ["dashboard", "teachers", "personnel_attendance", "my_personnel_attendance", "teacher_loads", "reports", "backup_restore", "personnel_settings"],
  administrative_assistant: ["dashboard", "personnel_attendance", "my_personnel_attendance", "reports", "personnel_settings"],
};

const roleByEmail = new Map([
  [BOOTSTRAP_EMAIL, "super_admin"],
]);

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

function getCreatedAt(user) {
  const createdAtMs = Number(user.createdAt);
  if (Number.isFinite(createdAtMs) && createdAtMs > 0) {
    return new Date(createdAtMs).toISOString();
  }

  return new Date().toISOString();
}

function inferRole(user) {
  const email = String(user.email ?? "").toLowerCase();
  if (user.localId === BOOTSTRAP_UID || email === BOOTSTRAP_EMAIL) return "super_admin";
  return roleByEmail.get(email) ?? "teacher";
}

function buildFirestoreFields(user) {
  const role = inferRole(user);
  const email = user.email ?? "";
  const fullName = user.displayName || email.split("@")[0] || "User";

  return {
    userId: { stringValue: user.localId },
    fullName: { stringValue: fullName },
    email: { stringValue: email },
    role: { stringValue: role },
    status: { stringValue: role === "super_admin" ? "approved" : "pending" },
    modulePermissions: {
      arrayValue: {
        values: defaultModulePermissionsByRole[role].map((moduleId) => ({ stringValue: moduleId })),
      },
    },
    createdAt: { timestampValue: getCreatedAt(user) },
  };
}

async function commitBatch(accessToken, writes) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ writes }),
    },
  );

  if (!response.ok) {
    throw new Error(`Firestore commit failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  const exportData = JSON.parse(fs.readFileSync(EXPORT_FILE, "utf8"));
  const users = Array.isArray(exportData.users) ? exportData.users : [];

  if (users.length === 0) {
    throw new Error(`No users found in ${EXPORT_FILE}`);
  }

  const accessToken = await getAccessToken();
  const writes = users.map((user) => ({
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/users/${user.localId}`,
      fields: buildFirestoreFields(user),
    },
  }));

  for (let index = 0; index < writes.length; index += 500) {
    await commitBatch(accessToken, writes.slice(index, index + 500));
  }

  const superAdmin = users.find(
    (user) => user.localId === BOOTSTRAP_UID || String(user.email ?? "").toLowerCase() === BOOTSTRAP_EMAIL,
  );
  const registrationFields = {
    userCount: { integerValue: String(users.length) },
    firstSuperAdminId: { stringValue: superAdmin?.localId ?? BOOTSTRAP_UID },
    updatedAt: { timestampValue: new Date().toISOString() },
  };

  await commitBatch(accessToken, [
    {
      update: {
        name: `projects/${PROJECT_ID}/databases/(default)/documents/system/registration`,
        fields: registrationFields,
      },
    },
  ]);

  const verifyResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users?pageSize=100`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!verifyResponse.ok) {
    throw new Error(`Restore wrote users, but verification read failed: ${verifyResponse.status} ${await verifyResponse.text()}`);
  }

  const verifyData = await verifyResponse.json();
  const restoredCount = Array.isArray(verifyData.documents) ? verifyData.documents.length : 0;

  console.log(`Restored ${users.length} Firestore user profile document(s).`);
  console.log(`Verified ${restoredCount} user profile document(s) currently readable from Firestore.`);
  console.log("Non-super-admin accounts were restored as pending teachers so Super Admin can reassign roles safely.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
