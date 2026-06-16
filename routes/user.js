const express = require('express');
const router = express.Router();
const { isAuthenticated, requireVerified } = require('../middleware/auth');
const userController = require('../controllers/userController');
const upload = require('../config/multer');
const { requireKycApproved } = require('../middleware/kyc');

// Apply authentication middleware to all user routes
router.use(isAuthenticated);

// Dashboard
router.get('/dashboard', userController.getDashboard);


// LLCs
router.get('/llcs', userController.getLLCs);
router.get('/llcs/:id', userController.getLLCDetail);

// Wallet
router.get('/wallet', requireVerified, userController.getWallet);
router.get('/wallet/create', requireVerified, requireKycApproved, userController.getCreateWallet);
router.post('/wallet/confirm', requireVerified, requireKycApproved, userController.postConfirmWallet);
router.get('/wallet/set-pin', requireVerified, userController.getSetPin);
router.post('/wallet/set-pin', requireVerified, userController.postSetPin);

router.get('/wallet/refresh', requireVerified, async (req, res) => {
  // clear cache for current user's wallet (just remove cache entries? we'll skip cache for now or force refresh)
  // For simplicity, redirect back to wallet page – the controller re‑fetches.
  res.redirect('/user/wallet');
});

// If user has a wallet with a PIN but hasn't unlocked it in this session, redirect to unlock page
router.get('/wallet', requireVerified, userController.getWallet);


// Unlock wallet
router.get('/wallet/unlock', requireVerified, (req, res) => {
  res.render('user/wallet-unlock', { user: req.session.user, error: null });
});

router.post('/wallet/unlock', requireVerified, userController.postUnlockWallet);

// Withdrawals
router.post('/wallet/withdraw', requireVerified, userController.submitWithdrawal);


// Settings
router.get('/settings', userController.getSettings);
router.post('/settings', userController.postSettings);
router.post('/settings/password', userController.postChangePassword);


// KYC routes
const kycUpload = upload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
    { name: 'addressDoc', maxCount: 1 }
  ]);
  router.get('/kyc', userController.getKyc);
  router.post('/kyc/submit', requireVerified, kycUpload, userController.submitKyc);

module.exports = router;