import { HardHat } from 'lucide-react'

interface Props {
  title?: string
  description?: string
  eta?: string
}

export function UnderConstruction({
  title = 'Under Construction',
  description = 'This module is currently being built. Check back soon!',
  eta,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-6">
      <div className="rounded-full bg-amber-100 p-6 mb-6">
        <HardHat className="h-12 w-12 text-amber-600" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-3">{title}</h2>
      <p className="text-gray-500 max-w-md leading-relaxed">{description}</p>
      {eta && (
        <p className="mt-4 text-sm font-medium text-amber-600 bg-amber-50 rounded-full px-4 py-1.5">
          Expected: {eta}
        </p>
      )}
      <div className="mt-8 flex gap-2">
        {[...Array(3)].map((_, i) => (
          <span
            key={i}
            className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  )
}
