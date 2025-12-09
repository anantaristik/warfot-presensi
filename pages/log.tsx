// pages/log.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";

type LogItem = {
  type: "in" | "out";
  time: Date;
  lat?: number;
  lng?: number;
};

const PAGE_SIZE = 20;

export default function LogPage() {
  const router = useRouter();

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogItem | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`; // format untuk <input type="month">
  });

  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const [loadingFirst, setLoadingFirst] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // 🔒 Pantau login
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
      } else {
        setFirebaseUser(user);
      }
    });

    return () => unsub();
  }, [router]);

  // Helper: dapatkan awal & akhir bulan dari selectedMonth
  const getMonthRange = () => {
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr) - 1; // 0-11

    const start = new Date(year, month, 1, 0, 0, 0);
    const end = new Date(year, month + 1, 0, 23, 59, 59); // tgl 0 bulan berikutnya = hari terakhir bulan ini
    return { start, end };
  };

  // 🚀 Load page pertama (saat user atau bulan berubah)
  useEffect(() => {
    const loadFirstPage = async () => {
      if (!firebaseUser) return;

      setLoadingFirst(true);
      setLogs([]);
      setLastDoc(null);
      setHasMore(false);

      const { start, end } = getMonthRange();

      const q = query(
        collection(db, "attendance"),
        where("uid", "==", firebaseUser.uid),
        where("clock_in", ">=", start),
        where("clock_in", "<=", end),
        orderBy("clock_in", "desc"),
        limit(PAGE_SIZE)
      );

      const snap = await getDocs(q);

      const newLogs: LogItem[] = [];

      snap.forEach((docSnap) => {
        const data = docSnap.data();

        if (data.clock_in) {
          newLogs.push({
            type: "in",
            time: data.clock_in.toDate(),
            lat: data.lat_in,
            lng: data.lng_in,
          });
        }

        if (data.clock_out) {
          newLogs.push({
            type: "out",
            time: data.clock_out.toDate(),
            lat: data.lat_out,
            lng: data.lng_out,
          });
        }
      });

      newLogs.sort((a, b) => b.time.getTime() - a.time.getTime());

      setLogs(newLogs);
      setLastDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMore(snap.size === PAGE_SIZE);
      setLoadingFirst(false);
    };

    loadFirstPage();
  }, [firebaseUser, selectedMonth]);

  // ➕ Load halaman berikutnya
  const handleLoadMore = async () => {
    if (!firebaseUser || !lastDoc || !hasMore) return;

    setLoadingMore(true);

    const { start, end } = getMonthRange();

    const q = query(
      collection(db, "attendance"),
      where("uid", "==", firebaseUser.uid),
      where("clock_in", ">=", start),
      where("clock_in", "<=", end),
      orderBy("clock_in", "desc"),
      startAfter(lastDoc),
      limit(PAGE_SIZE)
    );

    const snap = await getDocs(q);

    const newLogs: LogItem[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data();

      if (data.clock_in) {
        newLogs.push({
          type: "in",
          time: data.clock_in.toDate(),
          lat: data.lat_in,
          lng: data.lng_in,
        });
      }

      if (data.clock_out) {
        newLogs.push({
          type: "out",
          time: data.clock_out.toDate(),
          lat: data.lat_out,
          lng: data.lng_out,
        });
      }
    });

    newLogs.sort((a, b) => b.time.getTime() - a.time.getTime());

    setLogs((prev) => [...prev, ...newLogs]);
    setLastDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
    setHasMore(snap.size === PAGE_SIZE);
    setLoadingMore(false);
  };

  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;

  const formatDate = (d: Date) =>
    d.toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="min-h-screen bg-gray-100">
      {/* HEADER */}
      <header className="bg-white shadow px-4 py-4 flex justify-between items-center">
        <h1 className="font-bold text-lg text-gray-800">Attendance Log</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/presensi")}
            className="text-sm text-blue-600 font-semibold"
          >
            Kembali
          </button>
          <button
            onClick={async () => {
              await signOut(auth);
              router.replace("/login");
            }}
            className="text-sm text-red-600 font-semibold"
          >
            Logout
          </button>
        </div>
      </header>

      {/* FILTER BULAN */}
      <main className="p-4">
        <div className="max-w-md mx-auto mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-1">
            Filter Bulan
          </label>
          <input
            type="month"
            className="border px-3 py-2 bg-white text-gray-800 rounded w-full text-sm"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
        </div>

        {/* LIST LOG */}
        <div className="max-w-md mx-auto bg-white rounded-lg shadow divide-y">
          {loadingFirst && (
            <p className="text-center text-sm text-gray-500 py-6">
              Memuat log...
            </p>
          )}

          {!loadingFirst && logs.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-6">
              Belum ada riwayat presensi di bulan ini
            </p>
          )}

          {!loadingFirst &&
            logs.map((log, i) => (
              <div
                key={i}
                className="flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setSelectedLog(log)}
              >
                <div>
                  <p className="text-base font-semibold text-gray-800">
                    {formatTime(log.time)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(log.time)}
                  </p>
                </div>

                <span
                  className={`text-sm font-semibold px-3 py-1 rounded-full ${
                    log.type === "in"
                      ? "bg-green-100 text-green-700"
                      : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {log.type === "in" ? "Clock In" : "Clock Out"}
                </span>
              </div>
            ))}
        </div>

        {/* LOAD MORE */}
        {!loadingFirst && hasMore && (
          <div className="max-w-md mx-auto text-center py-4">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="text-sm text-blue-600 font-semibold disabled:opacity-50"
            >
              {loadingMore ? "Memuat..." : "Load More"}
            </button>
          </div>
        )}
      </main>

      {/* MODAL DETAIL */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full text-black max-w-sm rounded-lg p-4">
            <h3 className="font-bold text-lg mb-3">Detail Presensi</h3>

            <p className="text-sm mb-1">
              Status:{" "}
              <b>{selectedLog.type === "in" ? "Clock In" : "Clock Out"}</b>
            </p>

            <p className="text-sm mb-1">
              Waktu:{" "}
              {`${formatDate(selectedLog.time)} ${formatTime(selectedLog.time)} WIB`}
            </p>

            {selectedLog.lat != null && selectedLog.lng != null ? (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-1">
                  Lokasi saat presensi:
                </p>
                <iframe
                  className="w-full h-48 rounded"
                  src={`https://maps.google.com/maps?q=${selectedLog.lat},${selectedLog.lng}&z=16&output=embed`}
                  loading="lazy"
                />
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-3">
                Lokasi tidak tersedia untuk log ini.
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
    </div>
  );
}
