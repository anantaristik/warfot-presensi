// pages/api/uploadProfilePhoto.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cloudinary from "../../lib/cloudinary";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    // Upload ke Cloudinary
    const result = await cloudinary.uploader.upload(imageBase64, {
      folder: "profile_photos",   // ⬅️ folder yg tadi dibuat
      transformation: [
        { width: 512, height: 512, crop: "fill", gravity: "face" },
      ],
    });

    // result.secure_url -> URL gambar
    // result.public_id  -> ID file di Cloudinary (buat delete nanti)

    return res.status(200).json({
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (err: any) {
    console.error("Cloudinary upload error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
}
