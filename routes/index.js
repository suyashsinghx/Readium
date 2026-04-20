var express = require("express");
var router = express.Router();
const axios = require("axios");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");

const db = require("../database/db");

const API_KEY = process.env.API_KEY;

//check authentication
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/auth/login");
}

// Helper function to parse tags from comma-separated string to array
function parseTags(book) {
  if (book.tags && typeof book.tags === "string") {
    book.tags = book.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  } else if (!book.tags) {
    book.tags = [];
  }
  return book;
}

// get public page no auth
router.get("/", (req, res) => {
  res.render("public");
});

/* GET home page. */

router.get("/home", ensureAuth, async (req, res) => {
  try {
    const booksRes = await db.query(
      "SELECT * FROM books WHERE user_id = $1 ORDER BY created_at DESC LIMIT 4",
      [req.user.id],
    );

    let exploreBooks = [];

    //  ONLY FETCH IF USER HAS NO BOOKS
    if (booksRes.rows.length === 0) {
      try {
        const response = await axios.get(
          "https://www.googleapis.com/books/v1/volumes?q=best+books&maxResults=4",
        );

        exploreBooks = (response.data.items || []).map((item) => {
          const info = item.volumeInfo;

          return {
            title: info.title,
            author: info.authors?.[0] || "Unknown",
            cover_url: info.imageLinks?.thumbnail || "/images/default.png",
            rating: info.averageRating || "4.5",
          };
        });
      } catch (err) {
        console.log("Explore books error:", err.message);
      }
    }

    const totalBooksRes = await db.query(
      "SELECT COUNT(*) FROM books WHERE user_id = $1",
      [req.user.id],
    );

    const notesRes = await db.query("SELECT * FROM notes WHERE user_id = $1", [
      req.user.id,
    ]);

    const now = new Date();
    let notesThisWeek = 0;
    let notesYesterday = 0;

    notesRes.rows.forEach((note) => {
      const noteDate = new Date(note.date);
      const diffDays = (now - noteDate) / (1000 * 60 * 60 * 24);

      if (diffDays <= 7) notesThisWeek++;
      if (diffDays <= 1) notesYesterday++;
    });

    const currentBookRes = await db.query(
      "SELECT * FROM books WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [req.user.id],
    );

    res.render("home", {
      books: booksRes.rows,
      exploreBooks,
      totalBooks: parseInt(totalBooksRes.rows[0].count),
      notesThisWeek,
      notesYesterday,
      currentBook: currentBookRes.rows[0] || null,
    });
  } catch (err) {
    console.error(err);
    res.render("home", {
      books: [],
      exploreBooks: [],
    });
  }
});

// router.get("/", async (req, res) => {
//   const result = await db.query(
//     "SELECT * FROM books ORDER BY created_at DESC LIMIT 4",
//   );

//   // Parse tags for each book
//   const booksWithParsedTags = result.rows.map((book) => parseTags(book));

//   res.render("home", { books: booksWithParsedTags });
// });

//route for user profile upload
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/accounts/avatar", upload.single("avatar"), async (req, res) => {
  try {
    // UNIQUE NAME (short + meaningful)
    const fileName = `${req.user.id}_${Date.now()}.jpg`;
    const filePath = path.join(__dirname, "../public/uploads/", fileName);

    await sharp(req.file.buffer)
      .resize(200, 200)
      .jpeg({ quality: 60 })
      .toFile(filePath);

    // SAVE ONLY PATH (SMALL STRING)
    await db.query("UPDATE users SET avatar=$1 WHERE id=$2", [
      `/uploads/${fileName}`,
      req.user.id,
    ]);

    res.redirect("/accounts");
  } catch (err) {
    console.error(err);
    res.send("Upload error");
  }
});
// edit bio and name in user accounts page
router.post("/accounts/profile", async (req, res) => {
  const { name, bio } = req.body;

  await db.query("UPDATE users SET name=$1, bio=$2 WHERE id=$3", [
    name,
    bio,
    req.user.id,
  ]);

  res.redirect("/accounts");
});

// Get My Books page
router.get("/books", ensureAuth, async (req, res) => {
  // const books = await db.query('SELECT * FROM books ORDER BY created_at DESC');
  // console.log("BOOKSS:-->>", books);

  //writing logic for search in myBOOks page
  const search = req.query.search;
  const sort = req.query.sort || "date"; //for sorting
  const limit = parseInt(req.query.limit) || 12;

  // count no of books in database so that to show button in frontend if more books are available
  const resultCount = await db.query(
    "SELECT COUNT(*) FROM books WHERE user_id = $1",
    [req.user.id],
  );
  const totalBooks = parseInt(resultCount.rows[0].count);

  let query = "SELECT * FROM books WHERE user_id = $1";
  let params = [req.user.id];

  if (search) {
    query += ` AND (title ILIKE $2 OR author ILIKE $2)`;
    params.push(`%${search}%`);
  }

  if (sort === "rating") {
    query += " ORDER BY rating DESC";
  } else if (sort === "title") {
    query += " ORDER BY title ASC";
  } else {
    query += " ORDER BY created_at DESC";
  }

  query += ` LIMIT ${limit}`;

  const result = await db.query(query, params);
  // Parse tags for each book
  const booksWithParsedTags = result.rows.map((book) => parseTags(book));

  res.render("books", {
    books: booksWithParsedTags,
    search: search,
    sort: sort,
    totalBooks: totalBooks,
    limit: limit,
  });
});

router.get("/add", ensureAuth, async (req, res) => {
  const totalNotes = await db.query(
    "SELECT COUNT (*) FROM notes  WHERE user_id = $1",
    [req.user.id],
  );
  const totalBooks = await db.query(
    "SELECT COUNT (*) FROM books  WHERE user_id = $1",
    [req.user.id],
  );

  res.render("addBook", {
    totalNotes: parseInt(totalNotes.rows[0].count),
    totalBooks: parseInt(totalBooks.rows[0].count),
  });
});

router.post("/add", ensureAuth, async (req, res) => {
  try {
    const {
      title,
      author,
      rating,
      cover_url,
      description,
      pages,
      tags,
      notes,
    } = req.body;

    // Ensure title and author are not empty
    if (!title || !author) {
      return res.status(400).send("Title and Author are required");
    }

    await db.query(
      `INSERT INTO books (title, author, rating, cover_url, pages, tags, notes, ai_summary, user_id)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        title,
        author,
        rating || null,
        cover_url || null,
        pages || null,
        tags || null,
        notes || null,
        description || null,
        req.user.id,
      ],
    );

    res.redirect("/books");
  } catch (error) {
    console.error("Error inserting book:", error);
    res
      .status(500)
      .send(
        `Database Error: ${error.message}. <br><br>Make sure these columns exist in the database: cover_url, pages, tags, notes`,
      );
  }
});

// routes/books.ejs

router.get("/books/:id", ensureAuth, async (req, res) => {
  const book = await db.query(
    "SELECT * FROM books WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.id],
  );
  const limit = 5;
  const notes = await db.query(
    "SELECT * FROM notes WHERE book_id=$1 AND user_id=$2 ORDER BY date DESC LIMIT $3",
    [req.params.id, req.user.id, limit],
  );

  const totalNotes = await db.query(
    "SELECT COUNT(*) FROM notes WHERE book_id=$1 AND user_id=$2",
    [req.params.id, req.user.id],
  );

  const noteCount = notes.rows.length;
  const progress = Math.min(noteCount * 10, 100); // cap at 100

  // Parse tags from the book
  const bookWithParsedTags = parseTags(book.rows[0] || {});

  res.render("bookDetail", {
    book: bookWithParsedTags,
    notes: notes.rows,
    tags: bookWithParsedTags.tags || [],
    totalNotes: parseInt(totalNotes.rows[0].count),
    progress: progress,
  });
});

//route for delete method in books page to delete whole book
router.post("/books/:id", ensureAuth, async (req, res) => {
  try {
    const delId = req.params.id;
    // console.log("DELETE ID OF BOOK:--", delId);

    // First delete all notes associated with this book
    await db.query("DELETE FROM notes WHERE book_id = $1 AND user_id = $2", [
      delId,
      req.user.id,
    ]);

    // Then delete the book
    await db.query("DELETE FROM books WHERE id = $1 AND user_id = $2", [
      delId,
      req.user.id,
    ]);

    res.redirect("/books");
  } catch (error) {
    console.error("Error Executing Query: ", error);
    res.status(500).send(`Error deleting book: ${error.message}`);
  }
});

//route for book notes add in bookDetail page
router.get("/books/:id/notes/new", ensureAuth, async (req, res) => {
  res.render("addNote");
});

//post newnote
router.post("/books/:id/notes", ensureAuth, async (req, res) => {
  const { title, content, page } = req.body;

  await db.query(
    "INSERT INTO notes (book_id, title, content, page, user_id) VALUES ($1,$2,$3,$4,$5)",
    [req.params.id, title, content, page, req.user.id],
  );

  res.redirect(`/books/${req.params.id}`);
});

//  edit route for edition of notes
router.post("/notes/:id/edit", ensureAuth, async (req, res) => {
  const { title, content } = req.body;

  const note = await db.query(
    "SELECT * FROM notes WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.id],
  );

  if (!note.rows.length) {
    return res.status(403).send("Unauthorized access");
  }

  if (!note.rows.length) {
    return res.send("Note not found");
  }

  const bookId = note.rows[0].book_id;

  await db.query("UPDATE notes SET title=$1, content=$2 WHERE id=$3", [
    title,
    content,
    req.params.id,
  ]);

  res.redirect(`/books/${bookId}`);
});

//route for handling deletion of note

router.post("/notes/:id/delete", ensureAuth, async (req, res) => {
  const note = await db.query(
    "SELECT * FROM notes WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.id],
  );

  if (!note.rows.length) {
    return res.send("Note not found");
  }

  const bookId = note.rows[0].book_id;
  await db.query("DELETE FROM notes WHERE id = $1 AND user_id = $2", [
    req.params.id,
    req.user.id,
  ]);

  res.redirect(`/books/${bookId}`);
});

//this is route for AI-SUMMARY feature in bookDetail page
router.post("/books/:id/generate-ai", async (req, res) => {
  const bookId = req.params.id;

  const result = await db.query(
    "SELECT title, ai_summary FROM books WHERE id=$1 AND user_id=$2",
    [bookId, req.user.id],
  );

  const book = result.rows[0];

  // clean description
  let summary = book.ai_summary || "";

  summary =
    summary
      .replace(/<[^>]*>/g, "") // remove html
      .split(". ")
      .slice(0, 4)
      .join(". ") + ".";

  // generate insight
  const insights = [
    "Consistent reflection turns reading into real intelligence.",
    "Understanding grows when ideas are applied, not just consumed.",
    "Deep reading builds long-term thinking advantage.",
    "Clarity comes from connecting ideas across books.",
  ];

  const insight = insights[Math.floor(Math.random() * insights.length)];

  await db.query("UPDATE books SET ai_summary=$1, ai_insight=$2 WHERE id=$3", [
    summary,
    insight,
    bookId,
  ]);

  res.redirect(`/books/${bookId}`);
});

//  info: here is the route for addBook page user search Title and api calls search
router.get("/api/search", ensureAuth, async (req, res) => {
  try {
    const query = req.query.q;

    if (!query) return res.json([]);

    const response = await axios.get(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&key=${API_KEY}`,
    );

    const items = response.data.items || [];

    const books = items
      .filter((item) => {
        const info = item.volumeInfo;

        return info.title && info.authors && info.authors.length > 0;
      })
      .map((item) => {
        const info = item.volumeInfo;

        // console.log("DESCRIPTION :- ", info.description);

        return {
          title: info.title,
          author: info.authors ? info.authors[0] : "Unknown",
          cover: info.imageLinks?.thumbnail || "",
          rating: info.averageRating || "",
          pages: info.pageCount || "",
          tags: info.categories || [],
          description: info.description || "",
        };
      });

    res.json(books.slice(0, 5));
  } catch (err) {
    console.error("API ERROR:", err.message);
    res.json([]);
  }
});

//ROUTE FOR DASHBOARD------------
router.get("/dashboard", ensureAuth, async (req, res) => {
  try {
    //  Top rated books
    const booksRes = await db.query(
      "SELECT * FROM books WHERE user_id = $1 ORDER BY rating DESC NULLS LAST LIMIT 3",
      [req.user.id],
    );

    //  Recent notes (with book title)
    const notesRes = await db.query(
      `SELECT n.*, b.title AS book_title 
   FROM notes n 
   LEFT JOIN books b ON n.book_id = b.id 
   WHERE n.user_id = $1
   ORDER BY n.date DESC 
   LIMIT 5`,
      [req.user.id],
    );

    //  Total books
    const totalBooksRes = await db.query(
      "SELECT COUNT(*) FROM books WHERE user_id = $1",
      [req.user.id],
    );
    const totalBooks = parseInt(totalBooksRes.rows[0].count);

    //  Total notes
    const totalNotesRes = await db.query(
      "SELECT COUNT(*) FROM notes WHERE user_id = $1",
      [req.user.id],
    );
    const totalNotes = parseInt(totalNotesRes.rows[0].count);

    //  Books THIS MONTH
    const booksThisMonthRes = await db.query(
      `SELECT COUNT(*) FROM books 
   WHERE user_id = $1 
   AND created_at >= date_trunc('month', CURRENT_DATE)`,
      [req.user.id],
    );
    const booksThisMonth = parseInt(booksThisMonthRes.rows[0].count);

    //  Average rating
    const avgRatingRes = await db.query(
      "SELECT AVG(rating) FROM books WHERE user_id = $1",
      [req.user.id],
    );
    const avgRating = avgRatingRes.rows[0].avg
      ? parseFloat(avgRatingRes.rows[0].avg).toFixed(2)
      : null;

    //  Reading velocity
    const velocityRes = await db.query(
      `SELECT COUNT(*) FROM books 
   WHERE user_id = $1 
   AND created_at >= NOW() - INTERVAL '90 days'`,
      [req.user.id],
    );
    const readingVelocity = parseInt(velocityRes.rows[0].count);

    //  Currently reading (latest book)
    const currentBookRes = await db.query(
      "SELECT * FROM books WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [req.user.id],
    );
    const currentBook = currentBookRes.rows[0] || null;

    //  Knowledge Graph books (latest 4 books)
    const graphBooksRes = await db.query(
      "SELECT id, title FROM books WHERE user_id = $1 ORDER BY created_at DESC LIMIT 4",
      [req.user.id],
    );

    res.render("dashboard", {
      books: booksRes.rows,
      notes: notesRes.rows,
      totalBooks,
      totalNotes,
      avgRating,
      booksThisMonth,
      readingVelocity,
      currentBook,
      graphBooks: graphBooksRes.rows, // 🔥 NEW
    });
  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.send("Dashboard error");
  }
});

router.get("/creator", async (req, res) => {
  res.render("creator");
});

router.get("/accounts", ensureAuth, (req, res) => {
  res.render("userAcc");
});

module.exports = router;
