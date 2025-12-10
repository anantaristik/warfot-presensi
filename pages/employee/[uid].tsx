// pages/employee/[uid].tsx
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import LoadingScreen from "@/components/loadingScreen";
import Cropper, { Area } from "react-easy-crop"; 

// Helper untuk load image ke canvas
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = url;
  });
}

// Helper untuk crop image berdasarkan pixel area → hasil Blob
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  if (!ctx) {
    throw new Error("Canvas context not available");
  }

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


type AttendanceDoc = {
  id: string;
  uid: string;
  email?: string;
  date: string;
  clock_in?: any;
  clock_out?: any;
  lat_in?: number;
  lng_in?: number;
  lat_out?: number;
  lng_out?: number;
  final_hours?: number;
};

type UserDoc = {
  name: string;
  email?: string;
  photoUrl?: string;
  photoPublicId?: string; // ⬅️ tambah ini
  hourly_rate?: number;
  role?: string;
};


type DetailLog = {
  type: "in" | "out";
  time?: Date;
  date: string;
  lat?: number;
  lng?: number;
};

type TabType = "rekap" | "payroll";

export default function EmployeeDetailPage() {
  const router = useRouter();
  const { uid } = router.query;

  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [staff, setStaff] = useState<UserDoc | null>(null);
  const [attendance, setAttendance] = useState<AttendanceDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<TabType>("rekap");
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });

  const [payrollMonth, setPayrollMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });

  const [selectedLog, setSelectedLog] = useState<DetailLog | null>(null);

  // durasi final editable per baris (key: id doc)
  const [finalHours, setFinalHours] = useState<Record<string, number>>({});

  // 🔧 Edit profile modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"staff" | "admin">("staff");
  const [editHourlyRate, setEditHourlyRate] = useState<string>("");
  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null);
  const [editPhotoPublicId, setEditPhotoPublicId] = useState<string | null>(null);
  const [isUploadingEditPhoto, setIsUploadingEditPhoto] = useState(false);
  const [editNewPassword, setEditNewPassword] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [editCropOpen, setEditCropOpen] = useState(false);
  const [editCrop, setEditCrop] = useState({ x: 0, y: 0 });
  const [editZoom, setEditZoom] = useState(1);
  const [editCroppedAreaPixels, setEditCroppedAreaPixels] = useState<Area | null>(null);
  const [editTempImage, setEditTempImage] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 🔒 Cek admin & load data staff + attendance
  useEffect(() => {
    if (!uid) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      const meRef = doc(db, "users", user.uid);
      const meSnap = await getDoc(meRef);
      if (!meSnap.exists() || meSnap.data().role !== "admin") {
        alert("Akses ditolak. Khusus admin.");
        router.replace("/presensi");
        return;
      }

      setAdminUser(user);

      // data karyawan
      const staffRef = doc(db, "users", String(uid));
      const staffSnap = await getDoc(staffRef);
      if (!staffSnap.exists()) {
        alert("Data karyawan tidak ditemukan.");
        router.replace("/dashboard");
        return;
      }

      const staffData = staffSnap.data() as UserDoc;
      setStaff(staffData);

      // attendance karyawan
      const q = query(
        collection(db, "attendance"),
        where("uid", "==", String(uid)),
        orderBy("date", "desc")
      );
      const snap = await getDocs(q);
      const docs: AttendanceDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AttendanceDoc, "id">),
      }));

      setAttendance(docs);
      setLoading(false);
    });

    return () => unsub();
  }, [uid, router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;

  const formatDayDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const calcRawHours = (clockIn: any, clockOut: any): number | null => {
    if (!clockIn || !clockOut) return null;
    const start = clockIn.toDate();
    const end = clockOut.toDate();
    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) return 0;
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours;
  };

  const saveFinalHours = async (attendanceId: string, hours: number) => {
    try {
      const refDoc = doc(db, "attendance", attendanceId);
      await updateDoc(refDoc, { final_hours: hours });
    } catch (err) {
      console.error("Gagal menyimpan durasi final:", err);
    }
  };

  // 🔎 Filter Rekap Presensi
  const filteredRekap = useMemo(() => {
    if (!monthFilter) return [];
    const [yearStr, monthStr] = monthFilter.split("-");
    const prefix = `${yearStr}-${monthStr}`; // "2025-12"
    return attendance.filter((a) => a.date.startsWith(prefix));
  }, [attendance, monthFilter]);

  // 🧮 Range cutoff payroll: 21(prev month) - 20(current month)
  const getPayrollDateRange = (ym: string) => {
    const [yearStr, monthStr] = ym.split("-");
    let year = Number(yearStr);
    let month = Number(monthStr);

    const end = new Date(year, month - 1, 20, 23, 59, 59);
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    const start = new Date(prevYear, prevMonth - 1, 21, 0, 0, 0);

    const toStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    return {
      startDateStr: toStr(start),
      endDateStr: toStr(end),
    };
  };

  // 🔎 Filter Payroll
  const filteredPayroll = useMemo(() => {
    const { startDateStr, endDateStr } = getPayrollDateRange(payrollMonth);
    return attendance.filter(
      (a) => a.date >= startDateStr && a.date <= endDateStr
    );
  }, [attendance, payrollMonth]);

  // Default finalHours dari durasi kerja atau final_hours Firestore
  useEffect(() => {
    const map: Record<string, number> = {};
    filteredPayroll.forEach((a) => {
      const fromDoc =
        typeof a.final_hours === "number" ? a.final_hours : null;

      const h = calcRawHours(a.clock_in, a.clock_out);
      const base = h != null ? Number(h.toFixed(2)) : 0;

      map[a.id] = fromDoc != null ? fromDoc : base;
    });
    setFinalHours(map);
  }, [filteredPayroll]);

  const hourlyRate = staff?.hourly_rate || 0;

  // 🧩 Inisialisasi form edit ketika modal dibuka
  useEffect(() => {
    if (editOpen && staff) {
      setEditName(staff.name || "");
      setEditEmail(staff.email || "");
      setEditRole((staff.role as "staff" | "admin") || "staff");
      setEditHourlyRate(
        typeof staff.hourly_rate === "number"
          ? String(staff.hourly_rate)
          : ""
      );
      setEditPhotoUrl(staff.photoUrl || null);
      setEditPhotoPublicId(staff.photoPublicId || null);
      setEditNewPassword("");
      setEditError(null);
    }
  }, [editOpen, staff]);


  // 🧮 Saat user pilih file → buka cropper
  const handleEditPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setEditTempImage(url);
    setEditCropOpen(true);
    setEditError(null);
  };

  const handleEditCropComplete = (_: any, croppedPixels: Area) => {
    setEditCroppedAreaPixels(croppedPixels);
  };

  const handleEditCropCancel = () => {
    if (editTempImage) {
      URL.revokeObjectURL(editTempImage);
    }
    setEditTempImage(null);
    setEditCropOpen(false);
    setEditZoom(1);
    setEditCrop({ x: 0, y: 0 });
  };

  const handleEditCropDone = async () => {
    if (!editTempImage || !editCroppedAreaPixels) return;

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      alert("Cloudinary env belum di-set.");
      return;
    }

    setIsUploadingEditPhoto(true);
    setEditError(null);

    if (isUploadingEditPhoto) {
      setEditError("Tunggu sampai upload foto selesai.");
      return;
    }

    try {
      // hasilkan Blob dari area crop
      const croppedBlob = await getCroppedImg(
        editTempImage,
        editCroppedAreaPixels
      );

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
        setEditError("Gagal upload foto profil.");
        return;
      }

      setEditPhotoUrl(data.secure_url);
      setEditPhotoPublicId(data.public_id);
      setEditCropOpen(false);
    } catch (err) {
      console.error(err);
      setEditError("Gagal memproses foto profil.");
    } finally {
      if (editTempImage) {
        URL.revokeObjectURL(editTempImage);
      }
      setEditTempImage(null);
      setIsUploadingEditPhoto(false);
      setEditZoom(1);
      setEditCrop({ x: 0, y: 0 });
    }
  };





  // 💾 Simpan perubahan profil (Firestore + Auth via API)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !staff) return;

    setEditError(null);

    if (!editName.trim()) {
      setEditError("Nama wajib diisi.");
      return;
    }
    if (!editEmail.trim()) {
      setEditError("Email wajib diisi.");
      return;
    }
    if (!editHourlyRate.trim() || isNaN(Number(editHourlyRate))) {
      setEditError("Hourly rate harus berupa angka.");
      return;
    }
    if (editNewPassword && editNewPassword.length < 6) {
      setEditError("Password baru minimal 6 karakter.");
      return;
    }

    try {
      setEditSaving(true);
      const hourly = Number(editHourlyRate);

    const res = await fetch("/api/updateUser", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid: String(uid),
        name: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
        hourly_rate: hourly,
        photoUrl: editPhotoUrl || null,
        photoPublicId: editPhotoPublicId || null,
        newPassword: editNewPassword || null,
      }),
    });


      const data = await res.json();

      if (!res.ok) {
        console.error("Update user API error:", data);
        setEditError(data.error || "Gagal menyimpan perubahan.");
        setEditSaving(false);
        return;
      }

      // Update state lokal staff
      setStaff((prev) =>
        prev
          ? {
              ...prev,
              name: editName.trim(),
              email: editEmail.trim(),
              role: editRole,
              hourly_rate: hourly,
              photoUrl: editPhotoUrl || prev.photoUrl,
              photoPublicId: editPhotoPublicId || prev.photoPublicId,
            }
          : prev
      );


      setEditOpen(false);
    } catch (err) {
      console.error("Gagal update profil:", err);
      setEditError("Terjadi kesalahan saat menyimpan.");
    } finally {
      setEditSaving(false);
    }
  };

    if (loading || !staff) {
    return <LoadingScreen label="Memuat detail karyawan..." />;
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
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
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
            {/* Tombol close */}
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
                  router.push("/dashboard");
                  setSidebarOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
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
        <div className="mb-4 flex items-center justify-between lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-2xl text-gray-700"
            >
              ☰
            </button>
            <span className="text-sm font-semibold text-gray-600">
              Dashboard Karyawan
            </span>
          </div>
        {/* Header karyawan */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
          <div className="flex flex-col gap-3">
              <div className="flex gap-4">
                <div className="w-14 h-14 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                  {staff.photoUrl ? (
                    <img
                      src={staff.photoUrl}
                      alt={staff.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-lg text-gray-500">
                      {staff.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-bold text-base">{staff.name}</p>
                  <p className="text-xs text-gray-500">{staff.email || "-"}</p>
                  {hourlyRate > 0 && (
                    <p className="text-xs text-gray-600 mt-1">
                      Rate: Rp{hourlyRate.toLocaleString("id-ID")}/jam
                    </p>
                  )}
                </div>
            </div>
                <button
                  onClick={() => setEditOpen(true)}
                  className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded font-semibold hover:bg-gray-900"
                >
                  ✏️ Edit Profil
                </button>
          </div>
        </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-blue-600 font-semibold"
            >
              ‹ Kembali ke Karyawan
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b mb-4 flex gap-4 text-sm">
          <button
            onClick={() => setActiveTab("rekap")}
            className={`pb-2 ${
              activeTab === "rekap"
                ? "border-b-2 border-blue-600 font-semibold"
                : "text-gray-500"
            }`}
          >
            Rekap Presensi
          </button>
          <button
            onClick={() => setActiveTab("payroll")}
            className={`pb-2 ${
              activeTab === "payroll"
                ? "border-b-2 border-blue-600 font-semibold"
                : "text-gray-500"
            }`}
          >
            Payroll
          </button>
        </div>

        {/* Rekap Presensi Tab */}
        {activeTab === "rekap" && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Rekap Presensi</h2>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Filter Bulan:</span>
                <input
                  type="month"
                  className="border rounded px-2 py-1 text-xs"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border rounded text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2 text-left">Hari, Tanggal</th>
                    <th className="border p-2">Clock In</th>
                    <th className="border p-2">Clock Out</th>
                    <th className="border p-2">Durasi Kerja (Jam)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRekap.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center text-gray-500 p-4"
                      >
                        Belum ada presensi di bulan ini.
                      </td>
                    </tr>
                  )}

                  {filteredRekap.map((a, idx) => {
                    const clockInDate = a.clock_in?.toDate
                      ? a.clock_in.toDate()
                      : null;
                    const clockOutDate = a.clock_out?.toDate
                      ? a.clock_out.toDate()
                      : null;
                    const dur = calcRawHours(a.clock_in, a.clock_out);
                    return (
                      <tr key={idx} className="text-center">
                        <td className="border p-2 text-left">
                          {formatDayDate(a.date)}
                        </td>
                        <td className="border p-2">
                          {clockInDate ? (
                            <button
                              onClick={() =>
                                setSelectedLog({
                                  type: "in",
                                  time: clockInDate,
                                  date: a.date,
                                  lat: a.lat_in,
                                  lng: a.lng_in,
                                })
                              }
                              className="text-blue-600 hover:underline"
                            >
                              {formatTime(clockInDate)} &gt;
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="border p-2">
                          {clockOutDate ? (
                            <button
                              onClick={() =>
                                setSelectedLog({
                                  type: "out",
                                  time: clockOutDate,
                                  date: a.date,
                                  lat: a.lat_out,
                                  lng: a.lng_out,
                                })
                              }
                              className="text-blue-600 hover:underline"
                            >
                              {formatTime(clockOutDate)} &gt;
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="border p-2 font-semibold">
                          {dur != null ? dur.toFixed(2) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Payroll Tab */}
        {activeTab === "payroll" && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Payroll</h2>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Bulan Payroll:</span>
                <input
                  type="month"
                  className="border rounded px-2 py-1 text-xs"
                  value={payrollMonth}
                  onChange={(e) => setPayrollMonth(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-2">
              Periode: 21 bulan sebelumnya sampai 20 bulan terpilih.
            </p>

            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border rounded text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2 text-left">Hari, Tanggal</th>
                    <th className="border p-2">Clock In</th>
                    <th className="border p-2">Clock Out</th>
                    <th className="border p-2">Durasi Kerja (Jam)</th>
                    <th className="border p-2">Durasi Final (Jam)</th>
                    <th className="border p-2">Final Payroll</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayroll.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center text-gray-500 p-4"
                      >
                        Belum ada data payroll di periode ini.
                      </td>
                    </tr>
                  )}

                  {filteredPayroll.map((a, idx) => {
                    const clockInDate = a.clock_in?.toDate
                      ? a.clock_in.toDate()
                      : null;
                    const clockOutDate = a.clock_out?.toDate
                      ? a.clock_out.toDate()
                      : null;
                    const dur = calcRawHours(a.clock_in, a.clock_out);
                    const baseHours =
                      dur != null ? Number(dur.toFixed(2)) : 0;

                    const currentFinal =
                      finalHours[a.id] != null
                        ? finalHours[a.id]
                        : baseHours;

                    const finalPay = hourlyRate * currentFinal;

                    return (
                      <tr key={idx} className="text-center">
                        <td className="border p-2 text-left">
                          {formatDayDate(a.date)}
                        </td>
                        <td className="border p-2">
                          {clockInDate ? (
                            <button
                              onClick={() =>
                                setSelectedLog({
                                  type: "in",
                                  time: clockInDate,
                                  date: a.date,
                                  lat: a.lat_in,
                                  lng: a.lng_in,
                                })
                              }
                              className="text-blue-600 hover:underline"
                            >
                              {formatTime(clockInDate)} &gt;
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="border p-2">
                          {clockOutDate ? (
                            <button
                              onClick={() =>
                                setSelectedLog({
                                  type: "out",
                                  time: clockOutDate,
                                  date: a.date,
                                  lat: a.lat_out,
                                  lng: a.lng_out,
                                })
                              }
                              className="text-blue-600 hover:underline"
                            >
                              {formatTime(clockOutDate)} &gt;
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="border p-2 font-semibold">
                          {dur != null ? baseHours.toFixed(2) : "-"}
                        </td>
                        <td className="border p-2">
                          <input
                            type="number"
                            step="0.25"
                            min={0}
                            className="border rounded px-1 py-0.5 w-16 text-right"
                            value={currentFinal}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const safeVal = isNaN(val) ? 0 : val;
                              setFinalHours((prev) => ({
                                ...prev,
                                [a.id]: safeVal,
                              }));
                              saveFinalHours(a.id, safeVal);
                            }}
                          />
                        </td>
                        <td className="border p-2 font-semibold">
                          {finalPay > 0
                            ? `Rp${finalPay.toLocaleString("id-ID")}`
                            : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* POPUP DETAIL PRESENSI (MAPS) */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 text-black">
            <div className="bg-white w-full max-w-sm rounded-lg p-4">
              <h3 className="font-bold text-lg mb-3">Detail Presensi</h3>

              <p className="text-sm mb-1">
                Status:{" "}
                <b>
                  {selectedLog.type === "in" ? "Clock In" : "Clock Out"}
                </b>
              </p>

              <p className="text-sm mb-1">
                Waktu:{" "}
                {selectedLog.time
                  ? `${selectedLog.time.toLocaleDateString(
                      "id-ID"
                    )} ${formatTime(selectedLog.time)} WIB`
                  : "-"}
              </p>

              {selectedLog.lat != null && selectedLog.lng != null ? (
                <iframe
                  className="w-full h-48 rounded mt-3"
                  src={`https://maps.google.com/maps?q=${selectedLog.lat},${selectedLog.lng}&z=16&output=embed`}
                />
              ) : (
                <p className="text-sm text-gray-500 mt-3">
                  Lokasi belum tersedia.
                </p>
              )}

              <button
                onClick={() => setSelectedLog(null)}
                className="w-full mt-4 bg-gray-800 text-white py-2 rounded text-sm font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {/* MODAL CROP FOTO PROFIL (EDIT) */}
        {editCropOpen && editTempImage && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] text-black">
            <div className="bg-white w-[320px] h-[420px] rounded-lg p-4 relative flex flex-col">
              <h3 className="text-sm font-semibold mb-2">Crop Foto Profil</h3>

              <div className="relative flex-1 bg-black/5 rounded overflow-hidden">
                <Cropper
                  image={editTempImage}
                  crop={editCrop}
                  zoom={editZoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setEditCrop}
                  onZoomChange={setEditZoom}
                  onCropComplete={handleEditCropComplete}
                />
              </div>

              <div className="flex items-center justify-between mt-3 gap-2">
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={editZoom}
                  onChange={(e) => setEditZoom(Number(e.target.value))}
                  className="flex-1"
                />
              </div>

              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={handleEditCropCancel}
                  className="px-3 py-1.5 rounded border text-xs"
                >
                  Batal
                </button>
                <button
                  onClick={handleEditCropDone}
                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        )}


        {/* MODAL EDIT PROFIL */}
        {editOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 text-black">
            <div className="bg-white w-full max-w-md rounded-lg p-5 text-sm">
              <h2 className="text-base font-bold mb-3">
                Edit Profil Karyawan
              </h2>

              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Nama *
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold mb-1">
                      Role *
                    </label>
                    <select
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={editRole}
                      onChange={(e) =>
                        setEditRole(e.target.value as "staff" | "admin")
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
                      value={editHourlyRate}
                      onChange={(e) => setEditHourlyRate(e.target.value)}
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
                          onChange={handleEditPhotoChange}
                        />
                      </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Kalau tidak diisi, foto lama akan tetap dipakai.
                    </p>
                    {isUploadingEditPhoto && (
                      <p className="text-[11px] text-blue-600 mt-1">
                        Mengupload foto...
                      </p>
                    )}
                    {editPhotoUrl && (
                      <div className="mt-2">
                        <img
                          src={editPhotoUrl}
                          alt="Preview"
                          className="w-16 h-16 rounded-full object-cover border"
                        />
                      </div>
                    )}
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Password Baru (opsional)
                  </label>
                  <input
                    type="password"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={editNewPassword}
                    onChange={(e) => setEditNewPassword(e.target.value)}
                    placeholder="Kosongkan jika tidak ingin mengganti"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Minimal 6 karakter jika diisi.
                  </p>
                </div>

                {editError && (
                  <p className="text-xs text-red-600 font-semibold">
                    {editError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!editSaving) setEditOpen(false);
                    }}
                    className="px-3 py-1.5 rounded border text-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold disabled:opacity-60"
                  >
                    {editSaving ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
