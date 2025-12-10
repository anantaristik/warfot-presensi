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
    const {
      uid,
      name,
      email,
      role,
      hourly_rate,
      photoUrl,
      photoPublicId,   // ⬅️ TAMBAH INI
      newPassword,
    } = req.body;

    if (!uid || !name || !email || !role || hourly_rate == null) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Update Firebase Auth
    const updateAuthPayload: any = {
      email,
      displayName: name,
      photoURL: photoUrl || undefined,
    };

    if (newPassword && newPassword.length >= 6) {
      updateAuthPayload.password = newPassword;
    }

    await adminAuth.updateUser(uid, updateAuthPayload);

    // Update Firestore
    await adminDb.collection("users").doc(uid).update({
      name,
      email,
      role,
      hourly_rate,
      photoUrl: photoUrl || null,
      photoPublicId: photoPublicId || null,   // ⬅️ SIMPAN JUGA DI SINI
      updated_at: new Date(),
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("API updateUser error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Internal server error" });
  }
}
