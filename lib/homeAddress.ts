"use client";

const HOME_ADDRESS_KEY = "bamos.homeAddress";

export function getHomeAddress(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(HOME_ADDRESS_KEY) ?? "";
}

export function setHomeAddress(address: string): void {
  window.localStorage.setItem(HOME_ADDRESS_KEY, address);
}
