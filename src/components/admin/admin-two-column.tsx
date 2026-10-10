import type { ReactNode } from "react";

// Desktop edit layout (docs/admin-upload-layout-plan.md): details on the left, photos or
// files on the right, kept in view while scrolling. Stacks below 1280px.

export function AdminTwoColumn({ main, side, sideLabel }: { main: ReactNode; side: ReactNode; sideLabel: string }) {
  return (
    <div className="grid gap-12 min-[1280px]:grid-cols-[minmax(0,1fr)_24rem] min-[1280px]:items-start">
      <div className="grid min-w-0 gap-12">{main}</div>
      <aside aria-label={sideLabel} className="grid min-w-0 gap-10 min-[1280px]:sticky min-[1280px]:top-28">
        {side}
      </aside>
    </div>
  );
}
