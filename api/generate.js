module.exports = async (req, res) => {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { prompt } = req.body || {};

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        error: "Please enter an image description"
      });
    }

    const apiKey = process.env.POLLINATIONS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "AI engine is not configured yet"
      });
    }

    const imageURL =
      "https://gen.pollinations.ai/image/" +
      encodeURIComponent(prompt) +
      "?model=black-forest-labs%2Fflux.1-schnell";

    const response = await fetch(imageURL, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      return res.status(502).json({
        error: "Image generation failed",
        details: await response.text()
      });
    }

    const contentType =
      response.headers.get("content-type") || "image/jpeg";

    if (!contentType.startsWith("image/")) {
      return res.status(502).json({
        error: "Invalid image response"
      });
    }

    const image = Buffer.from(
      await response.arrayBuffer()
    );

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(image);

  } catch (error) {

    return res.status(500).json({
      error: "Server error",
      details: error.message
    });

  }
};
