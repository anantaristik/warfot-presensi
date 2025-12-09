import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";

type Attendance = {
  uid: string;
  email?: string;
  date: string;
  clock_in?: any;
  clock_out?: any;
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<Attendance[]>(([]));

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      // ✅ CEK ROLE ADMIN
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

      // ✅ Jika admin, lanjut ambil data presensi
      const q = query(
        collection(db, "attendance"),
        orderBy("date", "desc")
      );
      const snap = await getDocs(q);

      const data: Attendance[] = snap.docs.map((d) => ({
        ...(d.data() as Attendance),
      }));

      setAttendance(data);
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  const calcHours = (clockIn: any, clockOut: any) => {
    if (!clockIn || !clockOut) return "-";
    const start = clockIn.toDate();
    const end = clockOut.toDate();
    const diffMs = end.getTime() - start.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours.toFixed(2);
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  if (loading) return <div className="p-6">Cek akses admin...</div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="font-bold text-black text-lg">Dashboard Presensi (Admin)</h1>
        <div className="flex gap-4">
          <button
            onClick={() => router.push("/presensi")}
            className="text-sm text-blue-600 font-semibold"
          >
            Presensi
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-red-600 font-semibold"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="p-4 overflow-x-auto text-black ">
        <table className="min-w-full bg-white border rounded">
          <thead className="bg-gray-200 text-sm">
            <tr>
              <th className="p-2 border">Tanggal</th>
              <th className="p-2 border">Email</th>
              <th className="p-2 border">Clock In</th>
              <th className="p-2 border">Clock Out</th>
              <th className="p-2 border">Jam Kerja</th>
            </tr>
          </thead>
          <tbody>
            {attendance.map((item, i) => (
              <tr key={i} className="text-sm text-center">
                <td className="border p-2">{item.date}</td>
                <td className="border p-2">{item.email || "-"}</td>
                <td className="border p-2">
                  {item.clock_in?.toDate().toLocaleTimeString() || "-"}
                </td>
                <td className="border p-2">
                  {item.clock_out?.toDate().toLocaleTimeString() || "-"}
                </td>
                <td className="border p-2 font-semibold">
                  {calcHours(item.clock_in, item.clock_out)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}
