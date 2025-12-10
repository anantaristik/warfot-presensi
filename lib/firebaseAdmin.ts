import * as admin from "firebase-admin";


if (!admin.apps.length) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.NEXT_PUBLIC_FIREBASE_PRIVATE_KEY;


  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error("Missing Firebase admin environment variables");
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();


