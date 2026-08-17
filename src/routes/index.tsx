import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const HasidadiApp = lazy(() => import("../App"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hasidadi | Wakala Servicing & Float Governance ERP" },
      {
        name: "description",
        content:
          "Mobile money super-agent platform for Tanzania: 3-tier servicing classification, KPI target engines, float governance and field operations.",
      },
      {
        property: "og:title",
        content: "Hasidadi | Wakala Servicing & Float Governance ERP",
      },
      {
        property: "og:description",
        content:
          "Classify Daily MGT transactions, track KPI 1 volume and KPI 2 wakala penetration, and govern float requests, returns and shortfall loans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-bg p-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
      <p className="mt-4 font-mono text-xs font-semibold tracking-widest text-brand-primary uppercase">
        Initializing Secure Gateway...
      </p>
    </div>
  );
}

function Index() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <HasidadiApp />
      </Suspense>
    </ClientOnly>
  );
}
