import { Separator } from "@/components/ui/separator";

type ContentSectionProps = {
  title: string;
  desc: string;
  children: React.ReactNode;
};

export function ContentSection({ title, desc, children }: ContentSectionProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-none">
        <h3 className="text-lg font-medium tracking-tight text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <Separator className="my-4 flex-none" />
      <div className="h-full w-full overflow-y-auto pe-4 pb-12">
        <div className="-mx-1 px-1.5">{children}</div>
      </div>
    </div>
  );
}

