interface SkeletonProps {
  className?: string;
}

/**
 * Base skeleton component with pulse animation
 */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
    />
  );
}

/**
 * Skeleton that mimics the PersonaCard layout
 */
export function PersonaCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-5 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      {/* Date skeleton */}
      <Skeleton className="h-4 w-1/3 mb-4" />
      {/* Actions skeleton */}
      <div className="flex gap-2">
        <Skeleton className="flex-1 h-9 rounded-lg" />
        <Skeleton className="w-16 h-9 rounded-lg" />
      </div>
    </div>
  );
}

interface PersonaListSkeletonProps {
  count?: number;
}

/**
 * Grid of PersonaCardSkeletons for loading states
 */
export function PersonaListSkeleton({ count = 3 }: PersonaListSkeletonProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <PersonaCardSkeleton key={i} />
      ))}
    </div>
  );
}
