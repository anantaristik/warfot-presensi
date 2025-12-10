// pages/dashboard.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import LoadingScreen from "@/components/loadingScreen";
import Cropper, { Area } from "react-easy-crop";


type StaffUser = {
  uid: string;
  name: string;
  email?: string;
  photoUrl?: string;
  hourly_rate?: number;
  role?: string;
};

// helper untuk load image di canvas
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = url;
  });
}

// helper untuk crop image dan hasilkan Blob
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  if (!ctx) throw new Error("Canvas context not found");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        throw new Error("Canvas is empty");
      }
      resolve(blob);
    }, "image/jpeg");
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [cropOpen, setCropOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [tempImage, setTempImage] = useState<string | null>(null); // file sebelum crop

    // 🔹 state untuk modal tambah karyawan
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"staff" | "admin">("staff");
  const [newHourlyRate, setNewHourlyRate] = useState<string>("");
  const [savingUser, setSavingUser] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 🔹 Cloudinary photo state
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPublicId, setPhotoPublicId] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);


  // 🔒 Cek admin
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      // cek role
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        alert("Data user tidak ditemukan.");
        await signOut(auth);
        router.replace("/login");
        return;
      }

      const userData = userSnap.data();
      if (userData.role !== "admin") {
        alert("Akses ditolak. Khusus admin.");
        router.replace("/presensi");
        return;
      }

      setCurrentUser(user);

      // ambil semua karyawan role=staff
      const q = query(collection(db, "users"), where("role", "==", "staff"));
      const snap = await getDocs(q);

      const staff: StaffUser[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          name: data.name || "(Tanpa Nama)",
          email: data.email,
          photoUrl: data.photoUrl,
          hourly_rate: data.hourly_rate,
          role: data.role,
        };
      });

      setStaffList(staff);
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  // 🧮 upload foto ke Cloudinary
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // bikin URL sementara untuk di-preview di cropper
    const url = URL.createObjectURL(file);
    setTempImage(url);
    setCropOpen(true);
  };

  const handleCropComplete = (_: any, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
    };

    const handleCropCancel = () => {
      if (tempImage) {
        URL.revokeObjectURL(tempImage);
      }
      setTempImage(null);
      setCropOpen(false);
    };

    const handleCropDone = async () => {
      if (!tempImage || !croppedAreaPixels) return;

      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

      if (!cloudName || !uploadPreset) {
        alert("Cloudinary env belum di-set.");
        return;
      }

      setIsUploadingPhoto(true);
      setFormError(null);

      try {
        // hasilkan blob dari area crop
        const croppedBlob = await getCroppedImg(tempImage, croppedAreaPixels);

        const formData = new FormData();
        formData.append("file", croppedBlob);
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
          console.error("Cloudinary upload error:", data);
          setFormError("Gagal upload foto profil.");
          return;
        }

        setPhotoUrl(data.secure_url);
        setPhotoPublicId(data.public_id);
        setCropOpen(false);
      } catch (err) {
        console.error(err);
        setFormError("Gagal memproses foto profil.");
      } finally {
        if (tempImage) URL.revokeObjectURL(tempImage);
        setTempImage(null);
        setIsUploadingPhoto(false);
      }
    };




  const resetForm = () => {
    setNewPassword("");
    setNewName("");
    setNewEmail("");
    setNewRole("staff");
    setNewHourlyRate("");
    setPhotoUrl(null);
    setPhotoPublicId(null);
    setFormError(null);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // validasi
    if (!newName.trim()) {
      setFormError("Nama wajib diisi.");
      return;
    }
    if (!newEmail.trim()) {
      setFormError("Email wajib diisi.");
      return;
    }
    if (!newPassword.trim() || newPassword.length < 6) {
      setFormError("Password wajib diisi (min. 6 karakter).");
      return;
    }
    if (!newHourlyRate.trim() || isNaN(Number(newHourlyRate))) {
      setFormError("Hourly rate wajib berupa angka.");
      return;
    }
    if (isUploadingPhoto) {
      setFormError("Tunggu sampai upload foto selesai.");
      return;
    }

    try {
      setSavingUser(true);

      const hourly = Number(newHourlyRate);

      // 2) Panggil API /api/createUser
      const res = await fetch("/api/createUser", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: newEmail.trim(),
          password: newPassword.trim(),
          name: newName.trim(),
          role: newRole,
          hourly_rate: hourly,
          photoUrl: photoUrl || null,
          photoPublicId: photoPublicId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Create user API error:", data);
        setFormError(data.error || "Gagal membuat user baru.");
        setSavingUser(false);
        return;
      }

      // 3) Update list staff lokal
      setStaffList((prev) => [
        ...prev,
        {
          uid: data.uid,
          name: data.name,
          email: data.email,
          role: data.role,
          hourly_rate: data.hourly_rate,
          photoUrl: data.photoUrl || undefined,
        },
      ]);

      resetForm();
      setShowAddModal(false);
    } catch (err) {
      console.error("Gagal menambah karyawan:", err);
      setFormError("Terjadi kesalahan saat menyimpan data karyawan.");
    } finally {
      setSavingUser(false);
    }
  };

  if (loading) {
    return <LoadingScreen label="Cek akses admin..." />;
  }

  return (
    <div className="min-h-screen flex bg-gray-100 text-black">
      {/* SIDEBAR */}
      <aside className="hidden lg:flex w-64 bg-white shadow-md flex-col">
        <div className="px-4 py-4 border-b flex items-center gap-2">
          <img
            src="/logo-waroeng-foto.png"
            alt="Waroeng Foto"
            className="w-9 h-9 object-contain rounded-md"
          />
          <div>
            <p className="font-bold text-sm">Warfot Presensi</p>
            <p className="text-xs text-gray-500">Admin Panel</p>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 text-sm">
          <button className="w-full text-left px-3 py-2 rounded bg-gray-100 font-semibold">
            Karyawan
          </button>

          <button
            disabled
            className="w-full text-left px-3 py-2 rounded text-gray-400 cursor-not-allowed"
          >
            Pengaturan (segera)
          </button>
        </nav>

        <div className="px-4 py-3 border-t">
          <p className="text-xs text-gray-500 mb-1">Login sebagai Admin</p>
          <button
            onClick={handleLogout}
            className="w-full text-sm text-red-600 font-semibold text-left"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* MOBILE SIDEBAR OVERLAY */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 lg:hidden">
          <div className="w-64 h-full bg-white shadow-md p-4 flex flex-col">

            {/* Tombol Close */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-right text-xl mb-4"
            >
              ✕
            </button>

            <div className="px-2 py-4 border-b flex items-center gap-2">
              <img
                src="/logo-waroeng-foto.png"
                alt="Waroeng Foto"
                className="w-9 h-9 object-contain rounded-md"
              />
              <div>
                <p className="font-bold text-sm">Warfot Presensi</p>
                <p className="text-xs text-gray-500">Admin Panel</p>
              </div>
            </div>

            <nav className="flex-1 px-2 py-4 space-y-1 text-sm">
              <button
                onClick={() => {
                  setSidebarOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded bg-gray-100 font-semibold"
              >
                Karyawan
              </button>

              <button
                disabled
                className="w-full text-left px-3 py-2 rounded text-gray-400 cursor-not-allowed"
              >
                Pengaturan (segera)
              </button>
            </nav>

            <div className="px-4 py-3 border-t">
              <button
                onClick={async () => {
                  setSidebarOpen(false);
                  await handleLogout();
                }}
                className="w-full text-sm text-red-600 font-semibold text-left"
              >
                Logout
              </button>
            </div>

          </div>
        </div>
      )}


      {/* MAIN CONTENT */}
      <main className="flex-1 p-6">
        {/* HAMBURGER UNTUK MOBILE */}
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-2xl text-gray-700"
            >
              ☰
            </button>

            <span className="text-sm font-semibold text-gray-600">
              Daftar Karyawan
            </span>
          </div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Daftar Karyawan</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-sm bg-blue-600 text-white px-3 py-2 rounded font-semibold hover:bg-blue-700"
          >
            + Tambah Karyawan
          </button>
        </div>

        {staffList.length === 0 ? (
          <p className="text-sm text-gray-500">
            Belum ada karyawan dengan role <b>"staff"</b>.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {staffList.map((s) => (
              <button
                key={s.uid}
                onClick={() => router.push(`/employee/${s.uid}`)}
                className="bg-white rounded-lg shadow p-4 flex items-center gap-3 text-left hover:shadow-md transition"
              >
                <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                  {s.photoUrl ? (
                    <img
                      src={s.photoUrl}
                      alt={s.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm text-gray-500">
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.email || "-"}</p>
                  {typeof s.hourly_rate === "number" && (
                    <p className="text-xs text-gray-600 mt-1">
                      Rate: Rp{s.hourly_rate.toLocaleString("id-ID")}/jam
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {cropOpen && tempImage && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-100">
            <div className="bg-white w-[320px] h-[420px] rounded-lg p-4 relative flex flex-col">
              <h3 className="text-sm font-semibold mb-2">Crop Foto Profil</h3>

              <div className="relative flex-1 bg-black/10 rounded overflow-hidden">
                <Cropper
                  image={tempImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}             // 1:1 (square)
                  cropShape="round"      // preview bulat
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={handleCropComplete}
                />
              </div>

              <div className="flex items-center justify-between mt-3 gap-2">
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1"
                />
              </div>

              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={handleCropCancel}
                  className="px-3 py-1.5 rounded border text-xs"
                >
                  Batal
                </button>
                <button
                  onClick={handleCropDone}
                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        )}


      {/* MODAL TAMBAH KARYAWAN */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-lg p-5 text-sm">
            <h2 className="text-base font-bold mb-3">Tambah Karyawan Baru</h2>

            <form onSubmit={handleAddStaff} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Nama *
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Password (untuk karyawan login) *
                </label>
                <input
                  type="password"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 karakter"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold mb-1">
                    Role *
                  </label>
                  <select
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={newRole}
                    onChange={(e) =>
                      setNewRole(e.target.value as "staff" | "admin")
                    }
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-semibold mb-1">
                    Hourly Rate (Rp/jam) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={newHourlyRate}
                    onChange={(e) => setNewHourlyRate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Foto Profil (opsional)
                </label>
                <div>
                  <label
                    htmlFor="photo-input"
                    className="inline-block px-4 py-2 bg-blue-600 text-white text-xs rounded cursor-pointer hover:bg-blue-700"
                  >
                    Pilih Foto
                  </label>

                  <input
                    id="photo-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />

                  {photoUrl && (
                    <img
                      src={photoUrl}
                      className="w-16 h-16 rounded-full border mt-2 object-cover"
                    />
                  )}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Kalau tidak diisi, akan pakai inisial nama di lingkaran abu-abu.
                </p>
                {isUploadingPhoto && (
                  <p className="text-[11px] text-blue-600 mt-1">
                    Mengupload foto...
                  </p>
                )}
              </div>

              {formError && (
                <p className="text-xs text-red-600 font-semibold">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!savingUser) {
                      setShowAddModal(false);
                      resetForm();
                    }
                  }}
                  className="px-3 py-1.5 rounded border text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingUser || isUploadingPhoto}
                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {savingUser ? "Menyimpan..." : "Simpan Karyawan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
