module.exports = async (req, res) => {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const { prompt } = req.body || {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
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

    // Preserve the user's original description
    const userPrompt = prompt.trim();

    // Improve instruction following
    const enhancedPrompt = `
Create exactly the image described by the user.

USER'S ORIGINAL DESCRIPTION:
${userPrompt}

STRICT IMAGE INSTRUCTIONS:

1. Follow the user's description as accurately as possible.
2. The main subject must be exactly what the user requested.
3. Include all objects and details explicitly requested.
4. Do not replace the requested subject with another subject.
5. Do not invent people, women, men, animals, buildings,
   mountains, or other objects unless requested.
6. Do not change the requested location or scene.
7. Do not add unrelated decorative elements.
8. If the user describes multiple objects, include all of them.
9. Preserve the requested colors, shapes, and arrangement.
10. Do not omit important details from the original description.

The user's original request has priority over all other instructions.

Generate one visually coherent, high-quality image.
`;

    const imageURL =
      "https://gen.pollinations.ai/image/" +
      encodeURIComponent(enhancedPrompt) +
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
