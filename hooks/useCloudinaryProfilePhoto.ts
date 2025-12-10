// hooks/useCloudinaryProfilePhoto.ts
import { useState } from "react";

export function useCloudinaryProfilePhoto() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPublicId, setPhotoPublicId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      alert("Cloudinary env belum di-set");
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);
      formData.append("folder", "profile_photos");

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await res.json();

      if (!res.ok) {
        console.error("Cloudinary error:", data);
        alert("Gagal upload foto");
        return;
      }

      // ini dua yang penting:
      setPhotoUrl(data.secure_url);    // untuk ditampilkan & dikirim ke backend
      setPhotoPublicId(data.public_id); // buat referensi file di Cloudinary
    } catch (err) {
      console.error(err);
      alert("Gagal upload foto");
    } finally {
      setIsUploading(false);
    }
  }

  return {
    photoUrl,
    photoPublicId,
    isUploading,
    handlePhotoChange,
    setPhotoUrl,
    setPhotoPublicId,
  };
}
