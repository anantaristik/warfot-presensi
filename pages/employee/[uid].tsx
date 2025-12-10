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
  hourly_rate?: number;
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

  // durasi final editable per baris (key: date)
  const [finalHours, setFinalHours] = useState<Record<string, number>>({});

  // 🔒 Cek admin & load data staff + attendance
  useEffect(() => {
    if (!uid) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      // cek admin
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
        const ref = doc(db, "attendance", attendanceId);
        await updateDoc(ref, { final_hours: hours });
        // nanti kalau mau, bisa tambahin toast sukses di sini
    } catch (err) {
        console.error("Gagal menyimpan durasi final:", err);
        // kalau mau, bisa munculin alert/toast error juga
    }
    };


  // 🔎 Filter untuk tab Rekap Presensi (berdasarkan monthFilter: YYYY-MM)
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
    let month = Number(monthStr); // 1-12

    const end = new Date(year, month - 1, 20, 23, 59, 59); // 20 current
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    const start = new Date(prevYear, prevMonth - 1, 21, 0, 0, 0); // 21 prev

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

  // 🔎 Filter untuk Payroll tab
  const filteredPayroll = useMemo(() => {
    const { startDateStr, endDateStr } = getPayrollDateRange(payrollMonth);
    return attendance.filter(
      (a) => a.date >= startDateStr && a.date <= endDateStr
    );
  }, [attendance, payrollMonth]);

  // Default finalHours dari durasi kerja (sekali inisialisasi)
  useEffect(() => {
    const map: Record<string, number> = {};
    filteredPayroll.forEach((a) => {
        // kalau sudah ada final_hours di Firestore, pakai itu dulu
        const fromDoc =
        typeof a.final_hours === "number" ? a.final_hours : null;

        const h = calcRawHours(a.clock_in, a.clock_out);
        const base = h != null ? Number(h.toFixed(2)) : 0;

        map[a.id] = fromDoc != null ? fromDoc : base;
    });
    setFinalHours(map);
    }, [filteredPayroll]);


  const hourlyRate = staff?.hourly_rate || 0;

    if (loading || !staff) {
    return <LoadingScreen label="Memuat detail karyawan..." />;
    }


  return (
    <div className="min-h-screen flex bg-gray-100 text-black">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white shadow-md flex flex-col">
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

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6">
        {/* Header karyawan */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
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
                  Tarif: Rp{hourlyRate.toLocaleString("id-ID")}/jam
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-blue-600 font-semibold"
          >
            ‹ Kembali ke Karyawan
          </button>
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

                                // update state lokal
                                setFinalHours((prev) => ({
                                    ...prev,
                                    [a.id]: safeVal,
                                }));

                                // simpan ke Firestore
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

            {/* nanti di sini bisa ditambah total payroll & tombol "Generate Slip Gaji" */}
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
      </main>
    </div>
  );
}
