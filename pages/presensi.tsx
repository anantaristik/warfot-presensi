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
  orderBy,
} from "firebase/firestore";
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
} from "firebase/firestore";

type GeoPosition = {
  lat: number | null;
  lng: number | null;
};

export default function PresensiPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [now, setNow] = useState(new Date());
  const [selectedLog, setSelectedLog] = useState<{
    type: "in" | "out";
    time?: Date;
    date: string;
    lat?: number;
    lng?: number;
    } | null>(null);
  const [geo, setGeo] = useState<GeoPosition>({ lat: null, lng: null });
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [attendanceLog, setAttendanceLog] = useState<
    {
        type: "in" | "out";
        time?: Date; // boleh kosong
        date: string;
        lat?: number;
        lng?: number;
    }[]
    >([]);




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

    useEffect(() => {
    if (!user) return;

    const fetchLogs = async () => {
        const today = getTodayId();

        const q = query(
        collection(db, "attendance"),
        where("uid", "==", user.uid),
        where("date", "==", today)
        );

        const snap = await getDocs(q);

        const logs: {
        type: "in" | "out";
        time?: Date;
        date: string;
        lat?: number;
        lng?: number;
        }[] = [];

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

    fetchLogs();
    }, [user]);



  const getTodayId = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

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

  const handleClock = async (type: "in" | "out") => {
    if (!user) return;
    setLoading(true);
    setStatusMessage(null);

    try {
      const position = await getLocation();
      const dateId = getTodayId();
      const docId = `${user.uid}_${dateId}`;
      const ref = doc(db, "attendance", docId);

      const snap = await getDoc(ref);

      if (type === "in") {
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
        setStatusMessage("Clock In berhasil.");
      } else {
        if (!snap.exists()) {
          setStatusMessage("Belum Clock In hari ini.");
        } else {
          await updateDoc(ref, {
            clock_out: serverTimestamp(),
            lat_out: position.lat,
            lng_out: position.lng,
          });
          setStatusMessage("Clock Out berhasil.");
        }
      }
    } catch (err: any) {
      console.error("ERROR PRESENSI:", err);

      if (err?.code) {
        setStatusMessage(`Gagal: ${err.code}`);
      } else if (err?.message) {
        setStatusMessage(`Gagal: ${err.message}`);
      } else {
        setStatusMessage("Gagal menyimpan data presensi.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-600">Memuat...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="w-full bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-black text-lg">
            Presensi Waroeng Foto
          </h1>
        </div>

        <button
          onClick={handleLogout}
          className="text-sm text-red-600 font-medium"
        >
          Logout
        </button>
      </header>

      <main className="px-4 py-6 flex flex-col items-center">
       

        <div className="w-full max-w-md bg-white rounded-lg shadow p-6">
            
            <div className="mb-4 flex flex-col gap-4">
                <div className="w-full max-w-md bg-white rounded-lg shadow p-6 text-lg text-black font-bold">
                    Halo, 👋 {userName}
                </div>

                <div>
                    <p className="text-2xl font-bold text-gray-700 text-center">
                        {`${String(now.getHours()).padStart(2, "0")}:${String(
                            now.getMinutes()
                        ).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`}
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
        
        <div className="flex flex-col gap-2 mb-8">
            <h2 className="text-lg text-black font-semibold text-center">
                Jam Kerja
            </h2>
            <h2 className="text-4xl text-black font-semibold text-center">
                11:00 - 21:00 WIB
            </h2>
        </div>
          

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <button
              disabled={loading}
              onClick={() => handleClock("in")}
              className="flex-1 bg-green-600 text-white py-2 rounded font-semibold text-sm hover:bg-green-700 disabled:opacity-60"
            >
              Clock In
            </button>
            <button
              disabled={loading}
              onClick={() => handleClock("out")}
              className="flex-1 bg-orange-500 text-white py-2 rounded font-semibold text-sm hover:bg-orange-600 disabled:opacity-60"
            >
              Clock Out
            </button>
          </div>

          {/* ===== ATTENDANCE LOG ===== */}
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
                        {log.time
                            ? `${String(log.time.getHours()).padStart(2, "0")}:${String(
                                log.time.getMinutes()
                            ).padStart(2, "0")}`
                            : "--:--"}
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


          {statusMessage && (
            <p className="text-sm text-center text-red-600 font-semibold mb-2">
              {statusMessage}
            </p>
          )}

          {geo.lat && geo.lng && (
            <p className="text-xs text-gray-500 text-center">
              Lokasi terakhir: {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
            </p>
          )}
        </div>
        {selectedLog && (
        <div className="fixed inset-0 text-black  bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white w-full max-w-sm rounded-lg p-4">
            <h3 className="font-bold text-lg mb-3">Detail Presensi</h3>

            <p className="text-sm mb-1">
                Status:{" "}
                <b>{selectedLog.type === "in" ? "Clock In" : "Clock Out"}</b>
            </p>

        <p className="text-sm mb-1">
            Waktu:{" "}
            {selectedLog.time
            ? `${selectedLog.time.toLocaleDateString("id-ID")} ${String(
                selectedLog.time.getHours()
                ).padStart(2, "0")}:${String(
                selectedLog.time.getMinutes()
                ).padStart(2, "0")} WIB`
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
