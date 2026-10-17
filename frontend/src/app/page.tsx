import type { Metadata } from "next";
import { FeatureOrbit } from "@/components/landing/feature-orbit";

export const metadata: Metadata = {
  title: "Aegis Wealth AI",
  description: "Explore Aegis risk profiling, crisis replay, portfolio proposals and AI guidance in a simulated sandbox.",
};

export default function HomePage() {
  return <FeatureOrbit />;
}
