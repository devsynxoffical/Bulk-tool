export interface SpamAnalysisResult {
  score: number; // 0 - 100 (100 = perfect deliverability, <60 = high risk of spam folder)
  rating: "EXCELLENT" | "GOOD" | "MODERATE" | "HIGH_RISK";
  warnings: string[];
  tips: string[];
}

const HIGH_RISK_SPAM_WORDS = [
  "100% free", "100% satisfied", "all natural", "as seen on", "bargain", "be your own boss",
  "big bucks", "billion dollars", "buy now", "cash bonus", "cash prize", "casino",
  "claim now", "click here", "congratulations", "credit card", "cures", "double your income",
  "earn extra cash", "fast cash", "financial freedom", "free gift", "free money",
  "free sample", "full refund", "guaranteed cash", "guaranteed income", "income from home",
  "instant access", "investment", "join millions", "lottery", "make money fast",
  "no experience required", "no hidden fees", "no risk", "passwords", "risk free",
  "special promotion", "unbelievable deal", "unlimited cash", "urgent matter", "winner",
];

export function analyzeEmailSpamScore(
  subject: string = "",
  body: string = "",
): SpamAnalysisResult {
  let score = 100;
  const warnings: string[] = [];
  const tips: string[] = [];

  const combinedText = `${subject} ${body.replace(/<[^>]*>/g, " ")}`.toLowerCase();

  // 1. Subject check
  if (!subject.trim()) {
    score -= 25;
    warnings.push("Subject line is missing");
  } else {
    if (subject.length > 70) {
      score -= 5;
      tips.push("Subject line is long (> 70 chars). Keep it under 50 characters for higher open rates.");
    }
    if (subject === subject.toUpperCase() && subject.length > 5) {
      score -= 15;
      warnings.push("Subject line is ALL CAPS (high spam trigger)");
    }
    if ((subject.match(/!/g) || []).length > 1) {
      score -= 10;
      warnings.push("Multiple exclamation marks in subject line");
    }
  }

  // 2. High risk spam words
  const foundWords: string[] = [];
  for (const word of HIGH_RISK_SPAM_WORDS) {
    if (combinedText.includes(word)) {
      foundWords.push(word);
    }
  }

  if (foundWords.length > 0) {
    const penalty = Math.min(foundWords.length * 10, 40);
    score -= penalty;
    warnings.push(`Contains spam trigger phrase(s): "${foundWords.slice(0, 4).join('", "')}"`);
  }

  // 3. Unsubscribe link presence check
  const hasUnsubscribe =
    combinedText.includes("unsubscribe") ||
    combinedText.includes("{{unsubscribelink}}") ||
    combinedText.includes("opt out");

  if (!hasUnsubscribe) {
    score -= 15;
    warnings.push("Missing Unsubscribe link or CAN-SPAM compliance statement");
    tips.push("Include {{UnsubscribeLink}} to allow recipients to opt out instead of marking email as SPAM.");
  }

  // 4. Excessive links check
  const linkMatches = body.match(/href=["']/g) || [];
  if (linkMatches.length > 4) {
    score -= 10;
    warnings.push(`Email contains ${linkMatches.length} links. High link counts increase spam probability.`);
  }

  // Ensure score is bounded between 0 and 100
  score = Math.max(0, Math.min(100, score));

  let rating: SpamAnalysisResult["rating"] = "EXCELLENT";
  if (score < 50) rating = "HIGH_RISK";
  else if (score < 75) rating = "MODERATE";
  else if (score < 90) rating = "GOOD";

  return {
    score,
    rating,
    warnings,
    tips,
  };
}
