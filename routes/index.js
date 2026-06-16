const express = require('express');
const upload = require('../config/multer');
const router = express.Router();
const Plan = require('../models/Plan');
const User = require('../models/User');           
const LLCApplication = require('../models/LLCApplication'); 
const { isAuthenticated, requireVerified } = require('../middleware/auth');
const { sendEmail, emailTemplates } = require('../utils/emailService');
const { requireKycApproved } = require('../middleware/kyc');

// Home Page
router.get('/', async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort('price');
    res.render('index', { 
      title: 'River Stone Wyoming Formation -  Business Solutions',
      plans,
      user: req.session.user || null
    });
  } catch (error) {
    console.error(error);
    res.render('index', { 
      title: 'Crypto LLC Formation',
      plans: [],
      user: req.session.user || null
    });
  }
});

// Connect Page
router.get('/backup', (req, res) => {
  res.render('backup', { user: req.session.user || null });
});

// How It Works Page
router.get('/how-it-works', (req, res) => {
  res.render('how-it-works', { title: 'How It Works', user: req.session.user || null });
});

// About Page
router.get('/about', (req, res) => {
  res.render('about', { 
    title: 'About Us - River Stone Wyoming',
    user: req.session.user || null
  });
});

// Pricing Page
router.get('/pricing', async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort('price');
    res.render('pricing', { 
      title: 'Pricing Plans - Crypto LLC Formation',
      plans,
      user: req.session.user || null
    });
  } catch (error) {
    console.error(error);
    res.render('pricing', { 
      title: 'Pricing Plans',
      plans: [],
      user: req.session.user || null
    });
  }
});



// // Apply for LLC Page (Pre-auth)
// router.get('/apply', (req, res) => {
//   res.render('apply', { 
//     title: 'Start Your LLC Application',
//     user: req.session.user || null
//   });
// });


// Apply for LLC - Main form page
router.get('/apply', async (req, res) => {
  try {
    console.log('Apply route hit. Session user:', req.session.user);
    const plans = await Plan.find({ isActive: true }).sort('price');
    console.log('Plans fetched:', plans.length);
    const savedData = req.session.llcDraft || {};
    console.log('Saved data:', savedData);
    res.render('apply', { 
      title: 'Apply for LLC',
      plans: plans || [],
      user: req.session.user || null,
      savedData: savedData
    });
  } catch (error) {
    console.error('APPLY ROUTE ERROR:', error.message);
    console.error('Full error:', error.stack);
    res.status(500).render('500', { title: 'Server Error', error: error.message });
  }
});

// Save draft (AJAX endpoint)
router.post('/apply/save-draft', (req, res) => {
  req.session.llcDraft = req.body;
  res.json({ success: true });
});


// Submit full application (after signup/login)
router.post('/apply/submit',
  isAuthenticated,
  requireVerified,
  requireKycApproved,
  upload.fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'addressProof', maxCount: 1 }
  ]),
  async (req, res, next) => {  // <-- add 'next' to catch async errors
    try {
      const userId = req.session.user.id;
      const formData = { ...req.session.llcDraft, ...req.body };
      delete req.session.llcDraft; // Clear draft early

      console.log('📝 Form Data:', formData);
      console.log('📎 Files:', req.files);

      // 1. Build documents array
      const documents = [];
      if (req.files?.idDocument) {
        documents.push({
          fileName: req.files.idDocument[0].originalname,
          filePath: req.files.idDocument[0].path,
        });
      }
      if (req.files?.addressProof) {
        documents.push({
          fileName: req.files.addressProof[0].originalname,
          filePath: req.files.addressProof[0].path,
        });
      }

      // 2. Construct application data (match model exactly)
      const applicationData = {
        userId,
        planId: formData.planId,
        state: formData.state,                       // Formation state (DE, WY)
        desiredLLCName: formData.desiredLLCName,
        alternativeLLCName1: formData.alternativeLLCName1,
        alternativeLLCName2: formData.alternativeLLCName2,
        businessAddress: {
          street: formData.street,
          city: formData.city,
          state: formData.addressState || formData.state, // Business address state
          zipCode: formData.zipCode,
          county: formData.county || undefined,
        },
        registeredAgent: formData.registeredAgent || 'zen_business',
        memberName: formData.memberName,
        memberTitle: formData.memberTitle || 'Managing Member',
        memberOwnership: parseInt(formData.memberOwnership) || 100,
        businessPurpose: formData.businessPurpose,
        businessPurposeOther: formData.businessPurposeOther || undefined,
        documents,
        status: 'pending',
        submittedAt: new Date(),
      };

      // 3. Attempt to save
      const application = await LLCApplication.create(applicationData);
      console.log('✅ Application saved:', application._id);

      // 4. Send email
      const user = await User.findById(userId);
      const emailData = emailTemplates.llcSubmitted(user.fullName, application.desiredLLCName);
      await sendEmail({ to: user.email, subject: emailData.subject, html: emailData.html });

      // 5. Success – redirect to dashboard
      res.redirect('/user/dashboard?success=Application+submitted+successfully');
    } catch (error) {
      // 6. Catch any error and render a debug page
      console.error('❌ SUBMISSION ERROR:', error);
      
      // If validation error, extract details
      let errorDetails = error.message;
      if (error.name === 'ValidationError') {
        errorDetails = Object.values(error.errors).map(e => e.message).join(', ');
      }
      
      // Render a simple error page so you can read it
      res.status(500).send(`
        <h1>Application Submission Failed</h1>
        <p><strong>Error:</strong> ${errorDetails}</p>
        <pre>${error.stack}</pre>
        <a href="/apply">Go back to form</a>
      `);
    }
  }
);


// Continue application after login
router.get('/apply/continue/:id', isAuthenticated, async (req, res) => {
  try {
    const application = await LLCApplication.findOne({ 
      _id: req.params.id, 
      userId: req.session.user.id,
      status: 'incomplete'
    });
    if (!application) return res.redirect('/user/llcs');
    
    res.render('apply-continue', { 
      title: 'Complete Application',
      application,
      user: req.session.user
    });
  } catch (error) {
    res.redirect('/user/llcs');
  }
});


// GET verify page
router.get('/verify-email', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.render('auth/verify-email', { user: req.session.user, error: null });
});

// POST verify code
router.post('/verify-email', async (req, res) => {
  const { code } = req.body;
  const user = await User.findById(req.session.user.id);
  if (!user || user.emailVerificationCode !== code || user.emailVerificationExpires < Date.now()) {
    return res.render('auth/verify-email', { user: req.session.user, error: 'Invalid or expired code' });
  }
  user.emailVerified = true;
  user.emailVerificationCode = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  req.session.user.emailVerified = true;
  res.redirect('/user/dashboard');
});

// POST resend code
router.post('/resend-verification', async (req, res) => {
  const user = await User.findById(req.session.user.id);
  if (!user) return res.redirect('/auth/login');
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  user.emailVerificationCode = verificationCode;
  user.emailVerificationExpires = Date.now() + 10 * 60 * 1000;
  await user.save();
  const emailData = emailTemplates.verificationCode(user.fullName, verificationCode);
  await sendEmail({ to: user.email, subject: emailData.subject, html: emailData.html });
  res.render('auth/verify-email', { user: req.session.user, error: null, message: 'New code sent!' });
});

module.exports = router;
