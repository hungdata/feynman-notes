/** Schools that hold courses. "general" is the Lộ trình học school; the others are language schools. */
export const SCHOOLS = {
  general: { id: "general", name: "Trường Lộ trình học", path: "/learn", color: "#18a058", subject: "sách", upload: "Thêm sách PDF", intro: "Mỗi cuốn sách là một lớp học. Bấm vào cửa để vào lớp và học từng bài nhỏ." },
  english: { id: "english", name: "Trường Tiếng Anh", path: "/schools/english", color: "#c0392b", subject: "sách tiếng Anh", upload: "Thêm sách tiếng Anh", intro: "Mỗi giáo trình tiếng Anh là một lớp. AI dạy từ vựng, mẫu câu và ngữ pháp, có phiên âm và nghĩa tiếng Việt.", emblem: "ABC" },
  japanese: { id: "japanese", name: "Trường Tiếng Nhật", path: "/schools/japanese", color: "#d9480f", subject: "sách tiếng Nhật", upload: "Thêm sách tiếng Nhật", intro: "Mỗi giáo trình tiếng Nhật là một lớp. Bài học có kanji kèm hiragana, romaji và nghĩa tiếng Việt.", emblem: "あ" },
  korean: { id: "korean", name: "Trường Tiếng Hàn", path: "/schools/korean", color: "#1971c2", subject: "sách tiếng Hàn", upload: "Thêm sách tiếng Hàn", intro: "Mỗi giáo trình tiếng Hàn là một lớp. Bài học có hangul kèm phiên âm và nghĩa tiếng Việt.", emblem: "가" },
};

export const LANGUAGE_SCHOOLS = ["english", "japanese", "korean"];
export const schoolOf = (course) => SCHOOLS[course?.school] || SCHOOLS.general;
