import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";

export const EnochSurfaceShell = ({
  sidebar,
  main,
  context
}: {
  sidebar: ReactNode;
  main: ReactNode;
  context: ReactNode;
}) => (
  <section className="mx-auto grid w-[min(1500px,calc(100%-1.5rem))] gap-4 pb-6 pt-4 lg:w-[min(1500px,calc(100%-2rem))] lg:grid-cols-[320px_minmax(0,1fr)_380px] xl:gap-5">
    {sidebar}
    {main}
    {context}
  </section>
);

export const EnochSurfacePanel = ({
  title,
  eyebrow,
  description,
  action,
  className,
  contentClassName,
  children
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) => (
  <Card className={cn("overflow-hidden border-border/60 bg-card/95", className)}>
    <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
      <div className="space-y-1">
        {eyebrow ? <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p> : null}
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </CardHeader>
    <CardContent className={cn("p-5", contentClassName)}>{children}</CardContent>
  </Card>
);
