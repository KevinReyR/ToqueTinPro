"use client";

import { useEffect } from "react";

export function RecoveryRedirect() {
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);

    if (hash.get("type") === "recovery" || query.has("code")) {
      window.location.replace(`/operator/reset-password${window.location.search}${window.location.hash}`);
    }
  }, []);

  return null;
}
