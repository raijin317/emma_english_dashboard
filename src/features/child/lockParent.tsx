"use client";

import { useEffect } from "react";
import { parentSession } from "@/lib/client/api";

/**
 * Entering child mode locks the parent area: coming back to /parent — with the browser's Back button, a link or a
 * typed address — asks for the PIN again. (Otherwise the unlock lasts for the whole browser tab.)
 */
export function LockParentArea() {
  useEffect(() => {
    parentSession.lock();
  }, []);
  return null;
}
