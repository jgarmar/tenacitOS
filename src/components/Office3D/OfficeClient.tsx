'use client';

import dynamic from 'next/dynamic';

const Office3D = dynamic(() => import('./Office3D'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
      <div className="text-white text-xl">Cargando oficina 3D...</div>
    </div>
  ),
});

export default function OfficeClient() {
  return <Office3D />;
}
