const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const moment = require("moment");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      "https://guest-glider.web.app",
      "https://guest-glider.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ygqixms.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    //await client.connect();

    const roomsCollection = client.db("guestGlide").collection("rooms");
    const bookingCollection = client.db("guestGlide").collection("bookings");
    const reviewsCollection = client.db("guestGlide").collection("reviews");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    app.post("/logout", async (req, res) => {
      const user = req.body;
      res.clearCookie("token").send({ success: true });
    });

    app.get("/rooms", async (req, res) => {
      const rooms = roomsCollection.find();
      const result = await rooms.toArray();
      res.send(result);
    });

    app.get("/rooms/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await roomsCollection.findOne(query);
      res.send(result);
    });

    app.get("/bookings", verifyToken, async (req, res) => {
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      let query = {};
      if (req.query?.email) {
        query = { email: req.query.email };
      }

      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;

      const existingBooking = await bookingCollection.findOne({
        room_Id: booking.room_Id,
        email: booking.email,
      });

      if (existingBooking) {
        return res.status(400).send({ message: "Room is already booked" });
      }

      const roomQuery = { _id: new ObjectId(booking.room_Id) };
      const room = await roomsCollection.findOne(roomQuery);

      if (room.available_seats <= 0) {
        return res.status(400).send({ message: "Room is fully booked" });
      }

      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    app.patch("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedBooking = req.body;

      if (updatedBooking.status === "confirm") {
        const existingBooking = await bookingCollection.findOne(filter);
        if (!existingBooking || existingBooking.status === "confirm") {
          return res
            .status(400)
            .send({ message: "Booking not found or already confirmed" });
        }
        const roomQuery = { _id: new ObjectId(existingBooking.room_Id) };
        const room = await roomsCollection.findOne(roomQuery);

        if (room.available_seats <= 0) {
          return res.status(400).send({ message: "Room is fully booked" });
        }

        // Decrease available seats by 1
        const updatedRoom = { available_seats: room.available_seats - 1 };
        await roomsCollection.updateOne(roomQuery, { $set: updatedRoom });
      }

      const updateDoc = {
        $set: {
          status: updatedBooking.status,
        },
      };
      const result = await bookingCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const { reviewerId } = req.query;
      const reviews = reviewsCollection.find({ reviewerId }); // Filter reviews by reviewerId
      const result = await reviews.toArray();
      res.send(result);
    });

    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hotel Room Server is running");
});

app.listen(port, () => {
  console.log("Listening from port", port);
});
