/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Poppins", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#1F2937",
        muted: "#6B7280",
        mist: "#F6F7FB",
        civic: "#8B0000",
        signal: "#F2B81E",
        wine: "#5C0000",
        ember: "#A80000",
      },
    },
  },
  plugins: [],
};
