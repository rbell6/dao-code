import { ListFilterIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./ui/button";
import { Menu, MenuPopup, MenuTrigger } from "./ui/menu";

export function WorkspaceFilterMenu({
  activeCount,
  children,
  label = "Filters",
  onOpenChange,
}: {
  readonly activeCount: number;
  readonly children: ReactNode;
  readonly label?: string | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
}) {
  return (
    <Menu onOpenChange={onOpenChange}>
      <MenuTrigger
        render={
          <Button
            className={activeCount > 0 ? "[--control-icon-color:currentColor]" : undefined}
            variant="outline"
          />
        }
      >
        <ListFilterIcon className="size-4" />
        <span>{label}</span>
        {activeCount > 0 ? (
          <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
            {activeCount}
          </span>
        ) : null}
      </MenuTrigger>
      <MenuPopup align="end" className="w-56" side="bottom">
        {children}
      </MenuPopup>
    </Menu>
  );
}
