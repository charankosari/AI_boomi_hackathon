const {
  generateEmbedding,
  storeContext,
  retrieveRelevantContext,
  connectToMongo,
} = require("./a.js");

async function test() {
  try {
    await connectToMongo();

    // Test storing context
    await storeContext(
      "This is a test document about artificial intelligence.",
      {
        source: "test",
      }
    );

    // Test retrieving context
    const results = await retrieveRelevantContext("Tell me about AI");
    console.log("Retrieved contexts:", results);

    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

test();
