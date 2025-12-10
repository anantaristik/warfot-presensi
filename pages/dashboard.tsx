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
} from "firebase/firestore"
import LoadingScreen from "@/components/loadingScreen";


type StaffUser = {
  uid: string;
  name: string;
  email?: string;
  photoUrl?: string;
  hourly_rate?: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);

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
      const q = query(
        collection(db, "users"),
        where("role", "==", "staff")
      );
      const snap = await getDocs(q);

      const staff: StaffUser[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          name: data.name || "(Tanpa Nama)",
          email: data.email,
          photoUrl: data.photoUrl,
          hourly_rate: data.hourly_rate,
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

  if (loading) {
    return <LoadingScreen label="Cek akses admin..." />;
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
          <p className="text-xs text-gray-500 mb-1">
            Login sebagai Admin
          </p>
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
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Daftar Karyawan</h1>
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
                  <p className="text-xs text-gray-500">
                    {s.email || "-"}
                  </p>
                  {typeof s.hourly_rate === "number" && (
                    <p className="text-xs text-gray-600 mt-1">
                      Tarif: Rp{s.hourly_rate.toLocaleString("id-ID")}/jam
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
