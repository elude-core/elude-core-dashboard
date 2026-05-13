import { QuickLinksGrid } from "@/components/elude/QuickLinksGrid";

export default function LinksPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-bold text-2xl text-gray-900 dark:text-gray-100">Quick Links</h1>
      <QuickLinksGrid />
    </div>
  );
}
