import type { NextApiRequest, NextApiResponse } from "next";
import { adminAuth, adminDb } from "../../lib/firebaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, password, name, role, hourly_rate, photoUrl, photoPublicId } =
  req.body;

    if (!email || !password || !name || !role || hourly_rate == null) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1) Buat user di Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      photoURL: photoUrl || undefined,
    });

    const uid = userRecord.uid;

    // 2) Simpan data user di Firestore (collection users)
    const userDoc = {
      uid,
      name,
      email,
      role,
      hourly_rate,
      photoUrl: photoUrl || null,
      photoPublicId: photoPublicId || null,   // ⬅️ tambah ini
      created_at: new Date(),
    };

    await adminDb.collection("users").doc(uid).set(userDoc);

    return res.status(200).json(userDoc);
  } catch (err: any) {
    console.error("API createUser error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Internal server error" });
  }
}
