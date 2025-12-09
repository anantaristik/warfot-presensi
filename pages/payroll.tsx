import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { getPayrollPeriod } from "../lib/payroll";
import { calculateWorkHours } from "../lib/workHours";

type PayrollRow = {
  uid: string;
  name: string;
  totalDefaultHours: number;
  finalHours: number;
  hourlyRate: number;
  totalSalary: number;
};

export default function PayrollPage() {
  const router = useRouter();
  const [data, setData] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      // ✅ Ambil cut off dari settings (default 20)
      const cutoffSnap = await getDoc(doc(db, "payroll_settings", "default"));
      const cutoffDay = cutoffSnap.exists()
        ? cutoffSnap.data().cutoff_day
        : 20;

      const { start, end } = getPayrollPeriod(cutoffDay);

      // ✅ Ambil attendance dalam periode
      const q = query(
        collection(db, "attendance"),
        where("clock_in", ">=", start),
        where("clock_in", "<=", end)
      );

      const snap = await getDocs(q);

      const group: Record<string, number> = {};

      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (!d.clock_in || !d.clock_out) return;

        const clockIn = d.clock_in.toDate();
        const clockOut = d.clock_out.toDate();

        const { defaultHours } = calculateWorkHours(clockIn, clockOut);

        if (!group[d.uid]) group[d.uid] = 0;
        group[d.uid] += defaultHours;
      });

      // ✅ Ambil user info + tarif jam
      const result: PayrollRow[] = [];

      for (const uid of Object.keys(group)) {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (!userSnap.exists()) continue;

        const userData = userSnap.data();

        const totalDefaultHours = group[uid];
        const finalHours = totalDefaultHours; // bisa diedit manual nanti
        const hourlyRate = userData.hourly_rate || 0;
        const totalSalary = finalHours * hourlyRate;

        result.push({
          uid,
          name: userData.name,
          totalDefaultHours,
          finalHours,
          hourlyRate,
          totalSalary,
        });
      }

      setData(result);
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  const handleFinalHourChange = (uid: string, value: number) => {
    setData((prev) =>
      prev.map((r) =>
        r.uid === uid
          ? {
              ...r,
              finalHours: value,
              totalSalary: value * r.hourlyRate,
            }
          : r
      )
    );
  };

  if (loading) return <div className="p-6">Memuat payroll...</div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow p-4 flex justify-between">
        <h1 className="font-bold text-lg text-black">Payroll Waroeng Foto</h1>
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm text-blue-600 font-semibold"
        >
          Kembali
        </button>
      </header>

      <main className="p-4 overflow-x-auto text-black">
        <table className="min-w-full bg-white border rounded">
          <thead className="bg-gray-200 text-sm">
            <tr>
              <th className="p-2 border">Nama</th>
              <th className="p-2 border">Jam Default</th>
              <th className="p-2 border">Jam Final (Edit)</th>
              <th className="p-2 border">Tarif / Jam</th>
              <th className="p-2 border">Total Gaji</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.uid} className="text-sm text-center">
                <td className="border p-2 font-semibold">{row.name}</td>
                <td className="border p-2">{row.totalDefaultHours}</td>
                <td className="border p-2">
                  <input
                    type="number"
                    className="w-20 border rounded text-center"
                    value={row.finalHours}
                    onChange={(e) =>
                      handleFinalHourChange(row.uid, Number(e.target.value))
                    }
                  />
                </td>
                <td className="border p-2">
                  Rp {row.hourlyRate.toLocaleString()}
                </td>
                <td className="border p-2 font-bold text-green-700">
                  Rp {row.totalSalary.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}
