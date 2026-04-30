const {
  SkillRequestSignatureVerifier,
  TimestampVerifier
} = require('ask-sdk-express-adapter');

function getApplicationId(body) {
  return (
    body?.session?.application?.applicationId ||
        body?.context?.System?.application?.applicationId ||
        null
  );
}

function createAlexaVerifier(config) {
  const signatureVerifier = new SkillRequestSignatureVerifier();
  const timestampVerifier = new TimestampVerifier(config.alexaTimestampToleranceMs);

  return async (req, res, next) => {
    if (!config.alexaVerifySignature) {
      return next();
    }

    if (!req.rawBody) {
      return res.status(400).json({
        error: 'Missing raw request body for verification'
      });
    }

    try {
      await signatureVerifier.verify(req.rawBody, req.headers);
      await timestampVerifier.verify(req.rawBody);
    } catch (error) {
      return res.status(403).json({
        error: 'Invalid Alexa request signature',
        details: config.logVerbose ? error.message : undefined
      });
    }

    if (config.alexaSkillId) {
      const applicationId = getApplicationId(req.body);
      if (!applicationId) {
        return res.status(400).json({
          error: 'Missing Alexa application ID'
        });
      }

      if (applicationId !== config.alexaSkillId) {
        return res.status(403).json({
          error: 'Invalid Alexa skill ID'
        });
      }
    }

    return next();
  };
}

module.exports = {
  createAlexaVerifier
};
