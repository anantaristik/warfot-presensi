import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { serverTimestamp } from "firebase/firestore";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import LoadingScreen from "@/components/loadingScreen";

type GeoPosition = {
  lat: number | null;
  lng: number | null;
};

type AttendanceLogItem = {
  type: "in" | "out";
  time?: Date;
  date: string;
  lat?: number;
  lng?: number;
};

type ToastState = {
  message: string;
  variant: "in" | "out" | "error";
} | null;

export default function PresensiPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [now, setNow] = useState(new Date());
  const [selectedLog, setSelectedLog] = useState<AttendanceLogItem | null>(
    null
  );
  const [geo, setGeo] = useState<GeoPosition>({ lat: null, lng: null });
  const [loading, setLoading] = useState(false);
  const [attendanceLog, setAttendanceLog] = useState<AttendanceLogItem[]>([]);
  const [toast, setToast] = useState<ToastState>(null);

  const todayIn = attendanceLog.find((l) => l.type === "in");
  const hasClockIn = !!(todayIn && todayIn.time);


  // ⏱️ Jam realtime
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 🔒 Cek login + ambil nama user
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
      } else {
        setUser(u);

        try {
          const userRef = doc(db, "users", u.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            setUserName(userSnap.data().name || "User");
          } else {
            setUserName(u.email || "User");
          }
        } catch (err) {
          console.error("Gagal ambil data user:", err);
          setUserName(u.email || "User");
        }
      }
    });

    return () => unsub();
  }, [router]);

  // 🔄 Auto-hilangkan toast setelah 3 detik
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const getTodayId = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const fetchTodayLogs = async (currentUser: User | null) => {
    if (!currentUser) return;

    const today = getTodayId();

    const q = query(
      collection(db, "attendance"),
      where("uid", "==", currentUser.uid),
      where("date", "==", today)
    );

    const snap = await getDocs(q);

    const logs: AttendanceLogItem[] = [];

    if (snap.empty) {
      // BELUM ADA APA-APA HARI INI
      logs.push(
        { type: "in", date: today },
        { type: "out", date: today }
      );
    } else {
      const data = snap.docs[0].data();

      // CLOCK IN
      if (data.clock_in) {
        logs.push({
          type: "in",
          time: data.clock_in.toDate(),
          date: data.date,
          lat: data.lat_in,
          lng: data.lng_in,
        });
      } else {
        logs.push({ type: "in", date: data.date });
      }

      // CLOCK OUT
      if (data.clock_out) {
        logs.push({
          type: "out",
          time: data.clock_out.toDate(),
          date: data.date,
          lat: data.lat_out,
          lng: data.lng_out,
        });
      } else {
        logs.push({ type: "out", date: data.date });
      }
    }

    setAttendanceLog(logs);
  };

  // 📅 Ambil log hari ini saat user ready
  useEffect(() => {
    if (!user) return;
    fetchTodayLogs(user);
  }, [user]);

  const getLocation = (): Promise<GeoPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error("Geolocation tidak tersedia"));
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setGeo(coords);
          resolve(coords);
        },
        (err) => {
          reject(err);
        }
      );
    });
  };

  const formatTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;


  const handleClock = async (type: "in" | "out") => {
  if (!user) return;
  setLoading(true);
  setToast(null);

  try {
    const position = await getLocation();
    const dateId = getTodayId();
    const docId = `${user.uid}_${dateId}`;
    const ref = doc(db, "attendance", docId);

    const snap = await getDoc(ref);
    const existingData = snap.exists() ? snap.data() : null;

    if (type === "in") {
      // ✅ CEK: SUDAH CLOCK IN BELUM?
      if (existingData && existingData.clock_in) {
        const t: Date = existingData.clock_in.toDate();
        const jam = formatTime(t);

        setToast({
          message: `Kamu sudah Clock In hari ini pada ${jam}`,
          variant: "error",
        });

        // ❗ JANGAN OVERRIDE JAM LAMA
        return;
      }

      // Belum pernah clock in → simpan pertama kali
      await setDoc(
        ref,
        {
          uid: user.uid,
          email: user.email,
          date: dateId,
          clock_in: serverTimestamp(),
          lat_in: position.lat,
          lng_in: position.lng,
        },
        { merge: true }
      );

      setToast({
        message: "Clock In berhasil.",
        variant: "in",
      });
    } else {
      // CLOCK OUT
      if (!snap.exists()) {
        setToast({
          message: "Belum Clock In hari ini.",
          variant: "error",
        });
      } else {
        await updateDoc(ref, {
          clock_out: serverTimestamp(),
          lat_out: position.lat,
          lng_out: position.lng,
        });
        setToast({
          message: "Clock Out berhasil.",
          variant: "out",
        });
      }
    }

    // 🔄 Refresh log hari ini setelah Clock In/Out
      await fetchTodayLogs(user);
    } catch (err: any) {
      console.error("ERROR PRESENSI:", err);

      let message = "Gagal menyimpan data presensi.";
      if (err?.code) {
        message = `Gagal: ${err.code}`;
      } else if (err?.message) {
        message = `Gagal: ${err.message}`;
      }

      setToast({
        message,
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
};


  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  if (!user) {
    return <LoadingScreen label="Memuat presensi..." />;
  }


  // 🎨 Style toast sesuai tipe
  const getToastClasses = () => {
    if (!toast) return "";
    if (toast.variant === "in")
      return "bg-neutral-90 border-2 border-green-700 text-green-700";
    if (toast.variant === "out")
      return "bg-neutral-90 border-2 border-green-700 text-green-700";
    return "bg-red-600 text-white";
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="w-full bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/logo-waroeng-foto.png"
            alt="Waroeng Foto"
            className="w-8 h-8 object-contain"
          />
          <h1 className="font-semibold text-black text-lg">
            Presensi Waroeng Foto
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Tombol Dashboard */}
          <button
            onClick={() => user && router.push(`/users/${user.uid}`)}
            className="text-sm text-blue-600 font-medium hover:text-blue-800"
          >
            Dashboard
          </button>

          {/* Tombol Logout */}
          <button
            onClick={handleLogout}
            className="text-sm text-red-600 font-medium"
          >
            Logout
          </button>
        </div>
      </header>


      <main className="px-4 py-6 flex flex-col items-center">
        <div className="w-full max-w-md bg-white rounded-lg shadow p-6">
          <div className="mb-4 flex flex-col gap-4">
            <div className="w-full max-w-md rounded-lg shadow p-6 text-lg text-white font-bold flex flex-col items-center gap-3 bg-cover bg-center" style={{ backgroundImage: `url('/bg-anu.png')` }}>
                {/* Avatar */}
                <div className="w-25 h-25 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center shadow shadow-lg">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm text-gray-600">
                      {userName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Teks */}
                <span>Halo, 👋 {userName}</span>
              </div>

            <div>
              <p className="text-2xl font-bold text-gray-700 text-center">
                {`${String(now.getHours()).padStart(2, "0")}:${String(
                  now.getMinutes()
                ).padStart(2, "0")}:${String(
                  now.getSeconds()
                ).padStart(2, "0")}`}
              </p>

              <p className="text-md font-semibold text-gray-700 text-center">
                {now.toLocaleDateString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Jam kerja */}
          <div className="flex flex-col gap-2 mb-8">
            <h2 className="text-lg text-black font-semibold text-center">
              Jam Kerja
            </h2>
            <h2 className="text-4xl text-black font-semibold text-center">
              11:00 - 21:00 WIB
            </h2>
          </div>

          {/* Tombol clock in/out */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <button
              disabled={loading || hasClockIn}
              onClick={() => handleClock("in")}
              className="flex-1 bg-green-600 text-white py-2 rounded font-semibold text-sm hover:bg-green-700 disabled:opacity-60"
            >
              {hasClockIn ? "Sudah Clock In" : "Clock In"}
            </button>


            <button
              disabled={loading}
              onClick={() => handleClock("out")}
              className="flex-1 bg-orange-500 text-white py-2 rounded font-semibold text-sm hover:bg-orange-600 disabled:opacity-60"
            >
              Clock Out
            </button>
          </div>

          {/* Attendance Log hari ini */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-gray-800">Attendance Log</h3>
              <button
                onClick={() => router.push("/log")}
                className="text-sm text-blue-400 hover:text-blue-900 font-semibold"
              >
                View Log ›
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg divide-y">
              {attendanceLog.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  Belum ada presensi
                </p>
              )}

              {attendanceLog.map((log, i) => (
                <div
                  key={i}
                  onClick={() => log.time && setSelectedLog(log)}
                  className="flex justify-between items-center px-3 py-3 cursor-pointer hover:bg-gray-100"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {log.time ? formatTime(log.time) : "--:--"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(log.date).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        log.type === "in"
                          ? "text-green-600"
                          : "text-orange-600"
                      }`}
                    >
                      {log.type === "in" ? "Clock In" : "Clock Out"}
                    </span>
                    <span className="text-gray-400 text-lg">›</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lokasi terakhir */}
          {geo.lat && geo.lng && (
            <p className="text-xs text-gray-500 text-center mt-4">
              Lokasi terakhir: {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
            </p>
          )}
        </div>

        {/* Popup detail presensi */}
        {selectedLog && (
          <div className="fixed inset-0 text-black bg-black/40 flex items-center justify-center z-50">
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

        {/* TOAST */}
        {toast && (
          <div className="fixed inset-x-0 top-4 flex justify-center z-50">
            <div
              className={
                "px-4 py-2 rounded-md shadow-md text-sm font-semibold animate-fadeInUp " +
                getToastClasses()
              }
            >
              {toast.message}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
