import colors from "@/constants/colors";

export type Colors = typeof colors.dark & { radius: number };

// GitSync is always dark — matches the GitSync aesthetic
export function useColors(): Colors {
  return { ...colors.dark, radius: colors.radius };
}
