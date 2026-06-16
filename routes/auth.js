const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { sendEmail, emailTemplates } = require('../utils/emailService');

// Login Page
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/user/dashboard');
  }
  res.render('login', { 
    title: 'Login - Crypto LLC Premium',
    error: null,
    success: null
  });
});

// Login Handler
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('login', {
      title: 'Login',
      error: 'Please provide valid email and password',
      success: null
    });
  }

  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.render('login', {
        title: 'Login',
        error: 'Invalid email or password',
        success: null
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render('login', {
        title: 'Login',
        error: 'Invalid email or password',
        success: null
      });
    }

    // Set session
    req.session.user = {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: user.emailVerified || false,
      kycStatus: user.kycStatus || 'not_started'
    };

    // Generate JWT for API calls
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

    // Redirect based on role
    if (user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }
    res.redirect('/user/dashboard');
    
  } catch (error) {
    console.error(error);
    res.render('login', {
      title: 'Login',
      error: 'Server error. Please try again.',
      success: null
    });
  }
});

// Signup Page
router.get('/signup', (req, res) => {
  if (req.session.user) {
    return res.redirect('/user/dashboard');
  }
  res.render('signup', { 
    title: 'Create Account - Crypto LLC Premium',
    error: null,
    formData: {}
  });
});

router.post('/signup', [
  body('fullName').notEmpty().trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1
  }).withMessage('Password must be at least 8 characters with upper, lower, number, and symbol'),
  body('confirmPassword').custom((value, { req }) => value === req.body.password)
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('signup', { title: 'Create Account', error: errors.array()[0].msg, formData: req.body });
  }

  try {
    const { fullName, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('signup', { title: 'Create Account', error: 'Email already registered', formData: req.body });
    }

    // Generate 6-digit code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const user = await User.create({
      fullName,
      email,
      password,
      emailVerificationCode: verificationCode,
      emailVerificationExpires: Date.now() + 10 * 60 * 1000, // 10 minutes
      emailVerified: false,
      kycStatus: 'not_started'
    });

    // Send verification email
    const emailData = emailTemplates.verificationCode(user.fullName, verificationCode);
    await sendEmail({ to: user.email, subject: emailData.subject, html: emailData.html });

    // Set session – user is logged in but NOT verified
    req.session.user = {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: false,
      kycStatus: user.kycStatus || 'not_started'
    };

    // CRITICAL: redirect to verify page, NOT dashboard
    res.redirect('/auth/verify-email');

  } catch (error) {
    console.error('Signup error:', error);
    res.render('signup', { title: 'Create Account', error: 'Server error. Please try again.', formData: req.body });
  }
});


// Logout
router.get('/logout', (req, res) => {
  req.session.walletUnlocked = false;
  req.session.destroy(err => {
    if (err) console.error('Logout error:', err);
    res.clearCookie('connect.sid');
    res.clearCookie('token');
    res.redirect('/');
  });
});

// GET verify email page
router.get('/verify-email', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.render('auth/verify-email', { user: req.session.user, error: null, message: null });
});

// POST verify code
router.post('/verify-email', async (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  const { code } = req.body;
  try {
    const user = await User.findById(req.session.user.id);
    if (!user || user.emailVerificationCode !== code || user.emailVerificationExpires < Date.now()) {
      return res.render('auth/verify-email', { user: req.session.user, error: 'Invalid or expired code' });
    }

    // Mark as verified
    user.emailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Update session
    req.session.user.emailVerified = true;

    // Send welcome email
    const emailData = emailTemplates.welcome(user.fullName);
    await sendEmail({
      to: user.email,
      subject: emailData.subject,
      html: emailData.html
    });

    res.redirect('/user/dashboard?success=Email+verified+successfully');
  } catch (error) {
    console.error('Verification error:', error);
    res.render('auth/verify-email', { user: req.session.user, error: 'Server error' });
  }
});

// POST resend verification code
router.post('/resend-verification', async (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  try {
    const user = await User.findById(req.session.user.id);
    if (!user) return res.redirect('/auth/login');
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailVerificationCode = verificationCode;
    user.emailVerificationExpires = Date.now() + 10 * 60 * 1000;
    await user.save();
    const emailData = emailTemplates.verificationCode(user.fullName, verificationCode);
    await sendEmail({ to: user.email, subject: emailData.subject, html: emailData.html });
    res.render('auth/verify-email', { user: req.session.user, error: null, message: 'New code sent!' });
  } catch (error) {
    res.render('auth/verify-email', { user: req.session.user, error: 'Could not resend code' });
  }
});

module.exports = router;