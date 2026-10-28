import { Poppins } from "next/font/google";

/** WonderStar's typeface (docs/WONDERSTAR_PLATFORM.md section 9), applied only inside WonderStar surfaces via `font-ws`. */
export const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
