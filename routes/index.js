var express = require("express");
var router = express.Router();
const axios = require("axios");

const db = require("../database/db");

const API_KEY = process.env.API_KEY;

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

/* GET home page. */

router.get("/", async (req, res) => {
  try {
    const booksRes = await db.query(
      "SELECT * FROM books ORDER BY created_at DESC LIMIT 4",
    );

    const totalBooksRes = await db.query("SELECT COUNT(*) FROM books");
    const totalBooks = parseInt(totalBooksRes.rows[0].count);

    const notesRes = await db.query("SELECT * FROM notes");

    const now = new Date();
    let notesThisWeek = 0;
    let notesYesterday = 0;

    notesRes.rows.forEach((note) => {
      const noteDate = new Date(note.date || note.created_at);
      const diffDays = (now - noteDate) / (1000 * 60 * 60 * 24);

      if (diffDays <= 7) notesThisWeek++;
      if (diffDays <= 1) notesYesterday++;
    });

    //  Currently reading (latest book)
    const currentBookRes = await db.query(
      "SELECT * FROM books ORDER BY created_at DESC LIMIT 1",
    );
    const currentBook = currentBookRes.rows[0] || null;

    res.render("home", {
      books: booksRes.rows,
      totalBooks,
      notesThisWeek,
      notesYesterday,
      currentBook,
    });
  } catch (err) {
    console.error("HOME ERROR:", err);

    res.render("home", {
      books: [],
      totalBooks: 0,
      notesThisWeek: 0,
      notesYesterday: 0,
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

// Get My Books page
router.get("/books", async (req, res) => {
  // const books = await db.query('SELECT * FROM books ORDER BY created_at DESC');
  // console.log("BOOKSS:-->>", books);

  //writing logic for search in myBOOks page
  const search = req.query.search;
  const sort = req.query.sort || "date"; //for sorting
  const limit = parseInt(req.query.limit) || 12;

  // count no of books in database so that to show button in frontend if more books are available
  const resultCount = await db.query("SELECT COUNT(*) FROM books");
  const totalBooks = parseInt(resultCount.rows[0].count);

  let query = "SELECT * FROM books";

  if (search) {
    query += ` WHERE title ILIKE '%${search}%' OR author ILIKE '%${search}%'`;
  }
  //info: sorting logic from data base MYBOOK page
  if (sort == "rating") {
    query += " ORDER BY rating DESC";
  } else if (sort == "title") {
    query += " ORDER BY title ASC";
  } else {
    query += " ORDER BY created_at DESC";
  }

  query += ` LIMIT ${limit}`;

  const result = await db.query(query);
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

router.get("/add", async (req, res) => {
  const totalNotes = await db.query('SELECT COUNT (*) FROM notes');
  const totalBooks = await db.query('SELECT COUNT (*) FROM books');

  res.render("addBook", {
    totalNotes: parseInt(totalNotes.rows[0].count),
    totalBooks: parseInt(totalBooks.rows[0].count),
  });
});

router.post("/add", async (req, res) => {
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
      `INSERT INTO books (title, author, rating, cover_url, pages, tags, notes, ai_summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        title,
        author,
        rating || null,
        cover_url || null,
        pages || null,
        tags || null,
        notes || null,
        description || null,
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

router.get("/books/:id", async (req, res) => {
  const book = await db.query("SELECT * FROM books WHERE id = $1", [
    req.params.id,
  ]);
  const limit = 5;
  const notes = await db.query(
    "SELECT * FROM notes WHERE book_id=$1 ORDER BY date DESC LIMIT $2",
    [req.params.id, limit],
  );

  const totalNotes = await db.query(
    "SELECT COUNT(*) FROM notes WHERE book_id=$1",
    [req.params.id],
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
router.post("/books/:id", async (req, res) => {
  try {
    const delId = req.params.id;
    console.log("DELETE ID OF BOOK:--", delId);

    // First delete all notes associated with this book
    await db.query("DELETE FROM notes WHERE book_id = $1", [delId]);

    // Then delete the book
    await db.query("DELETE FROM books WHERE id = $1", [delId]);

    res.redirect("/books");
  } catch (error) {
    console.error("Error Executing Query: ", error);
    res.status(500).send(`Error deleting book: ${error.message}`);
  }
});

//route for book notes add in bookDetail page
router.get("/books/:id/notes/new", async (req, res) => {
  res.render("addNote");
});

//post newnote
router.post("/books/:id/notes", async (req, res) => {
  const { title, content, page } = req.body;

  await db.query(
    "INSERT INTO notes (book_id, title, content, page) VALUES ($1,$2,$3,$4)",
    [req.params.id, title, content, page],
  );

  res.redirect(`/books/${req.params.id}`);
});

//  edit route for edition of notes
router.post("/notes/:id/edit", async (req, res) => {
  const { title, content } = req.body;

  const note = await db.query("SELECT * FROM notes WHERE id = $1", [
    req.params.id,
  ]);

  const bookId = note.rows[0].book_id;

  await db.query("UPDATE notes SET title=$1, content=$2 WHERE id=$3", [
    title,
    content,
    req.params.id,
  ]);

  res.redirect(`/books/${bookId}`);
});


//route for handling deletion of note

router.post("/notes/:id/delete", async (req, res) => {
  const note = await db.query("SELECT * FROM notes WHERE id = $1", [
    req.params.id,
  ]);

  const bookId = note.rows[0].book_id;
  await db.query("DELETE FROM notes WHERE id = $1", [req.params.id]);

  res.redirect(`/books/${bookId}`);
});

//this is route for AI-SUMMARY feature in bookDetail page
router.post("/books/:id/generate-ai", async (req, res) => {
  const bookId = req.params.id;

  const result = await db.query(
    "SELECT title, ai_summary FROM books WHERE id=$1",
    [bookId],
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
router.get("/api/search", async (req, res) => {
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
router.get("/dashboard", async (req, res) => {
  try {
    //  Top rated books
    const booksRes = await db.query(
      "SELECT * FROM books ORDER BY rating DESC NULLS LAST LIMIT 3",
    );

    //  Recent notes (with book title)
    const notesRes = await db.query(`
      SELECT n.*, b.title AS book_title 
      FROM notes n 
      LEFT JOIN books b ON n.book_id = b.id 
      ORDER BY n.date DESC 
      LIMIT 5
    `);

    //  Total books
    const totalBooksRes = await db.query("SELECT COUNT(*) FROM books");
    const totalBooks = parseInt(totalBooksRes.rows[0].count);

    //  Total notes (IMPORTANT for Knowledge Graph)
    const totalNotesRes = await db.query("SELECT COUNT(*) FROM notes");
    const totalNotes = parseInt(totalNotesRes.rows[0].count);

    //  Books THIS MONTH 
    const booksThisMonthRes = await db.query(`
      SELECT COUNT(*) FROM books 
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);
    const booksThisMonth = parseInt(booksThisMonthRes.rows[0].count);

    //  Average rating
    const avgRatingRes = await db.query("SELECT AVG(rating) FROM books");
    const avgRating = avgRatingRes.rows[0].avg
      ? parseFloat(avgRatingRes.rows[0].avg).toFixed(2)
      : null;

    //  Reading velocity (books last 90 days)
    const velocityRes = await db.query(`
      SELECT COUNT(*) FROM books 
      WHERE created_at >= NOW() - INTERVAL '90 days'
    `);
    const readingVelocity = parseInt(velocityRes.rows[0].count);

    //  Currently reading (latest book)
    const currentBookRes = await db.query(
      "SELECT * FROM books ORDER BY created_at DESC LIMIT 1",
    );
    const currentBook = currentBookRes.rows[0] || null;

    //  Knowledge Graph books (latest 4 books)
    const graphBooksRes = await db.query(
      "SELECT id, title FROM books ORDER BY created_at DESC LIMIT 4",
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

router.get('/creator', async (req, res) => {
  res.render('creator');
})

// temprary checking
router.get("/test-db", async (req, res) => {
  try {
    const result = await db.query("SELECT NOW()");
    res.send(result.rows);
  } catch (err) {
    console.error(err);
    res.send("DB ERROR");
  }
});

module.exports = router;
