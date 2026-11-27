/** Lightweight bn/en dictionary — usage: const { t, lang, setLang } = useLang();  t("home") */
export type Lang = "en" | "bn";
export const STR = {
  en: {
    hot_games: "Hot Games", support: "Support", cashback: "Cashback", agent: "Agent", rewards: "Rewards",
    slots: "Slots", live: "Live", crash: "Crash", table: "Table", instant: "Instant", fishing: "Fishing", bingo: "Bingo", keno: "Keno", virtual: "Virtual", sportsbook: "Sportsbook", poker: "Poker", sports: "Sports", other: "Other",
    my_favorites: "My Favorites", hot_section: "Hot Games", sync: "Sync from SoftAggregator",
    play_now: "Play", free_trial: "Free Trial", trial_badge: "DEMO", play_real_note: "Real money · your wallet", trial_note: "Practice for free · no real money", launching_real: "Opening the game…", launching_trial: "Starting free trial…", close: "Close", balance_label: "Balance",
    home: "Home", deposit: "Deposit", promotion: "Promotion", withdraw: "Withdraw", member: "Profile",
    app: "App", get_app: "Get the app", download_apk: "Download APK",
    login: "Login", register: "Register", logout: "Logout", balance: "Balance",
    trx_id: "TrxID", amount: "Amount", account_number: "Account Number", submit: "Submit",
    deposit_history: "Deposit History", withdraw_history: "Withdrawal History",
    login_to_play: "Login to play", welcome_back: "Welcome back",
  },
  bn: {
    hot_games: "গরম খেলা", support: "পরিষেবা", cashback: "ক্যাশব্যাক", agent: "এজেন্ট", rewards: "পুরস্কার",
    slots: "স্লট", live: "লাইভ", crash: "ক্র্যাশ", table: "টেবিল", instant: "তাত্ক্ষণিক", fishing: "ফিশিং", bingo: "বিঙ্গো", keno: "কেনো", virtual: "ভার্চুয়াল", sportsbook: "স্পোর্টসবুক", poker: "পোকার", sports: "স্পোর্টস", other: "অন্যান্য",
    my_favorites: "আমার প্রিয়", hot_section: "গরম খেলা", sync: "SoftAggregator সিঙ্ক",
    play_now: "খেলুন", free_trial: "ফ্রি ট্রায়াল", trial_badge: "ডেমো", play_real_note: "রিয়েল মানি · আপনার ওয়ালেট", trial_note: "ফ্রি প্র্যাকটিস · আসল টাকা নয়", launching_real: "গেম খোলা হচ্ছে…", launching_trial: "ফ্রি ট্রায়াল চালু হচ্ছে…", close: "বন্ধ করুন", balance_label: "ব্যালেন্স",
    home: "হোম", deposit: "ডিপোজিট", promotion: "প্রমোশন", withdraw: "উত্তোলন", member: "প্রোফাইল",
    app: "অ্যাপ", get_app: "অ্যাপ নিন", download_apk: "APK ডাউনলোড",
    login: "লগইন", register: "রেজিস্টার", logout: "লগআউট", balance: "ব্যালেন্স",
    trx_id: "ট্রানজেকশন আইডি", amount: "পরিমাণ", account_number: "অ্যাকাউন্ট নম্বর", submit: "জমা দিন",
    deposit_history: "ডিপোজিট ইতিহাস", withdraw_history: "উত্তোলন ইতিহাস",
    login_to_play: "খেলতে লগইন করুন", welcome_back: "স্বাগতম",
  },
} as const;
export type MsgKey = keyof (typeof STR)["en"];
export function translate(lang: Lang, key: MsgKey): string {
  return (STR[lang] as any)[key] ?? STR.en[key];
}
