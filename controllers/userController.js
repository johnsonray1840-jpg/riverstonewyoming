const User = require('../models/User');
const Plan = require('../models/Plan');
const LLCApplication = require('../models/LLCApplication');
const WalletPool = require('../models/WalletPool');
const { sendEmail, emailTemplates } = require('../utils/emailService');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const {
  getBtcBalance,
  getEthBalance,
  getBscBalance,
  getXrpBalance,
  getUsdValueForSymbol,
  getExplorerUrl
} = require('../utils/blockchain');
const WithdrawalRequest = require('../models/WithdrawalRequest');


// ============================================
// HELPER: fetch full wallet data with live balances
// ============================================
async function getWalletData(userId) {
  const wallet = await WalletPool.findOne({ assignedTo: userId })
    .populate('assignedLLCId', 'desiredLLCName');
  const hasApprovedLLC = await LLCApplication.exists({ userId, status: 'approved' });

  let qrCodes = {};
  let chainBalances = {};
  let totalBalance = 0;

  if (wallet) {
    const chains = ['btc', 'eth', 'usdt', 'xrp', 'bnb'];

    const [btcBal, ethData, xrpBal, bscData] = await Promise.all([
      getBtcBalance(wallet.addresses.btc),
      getEthBalance(wallet.addresses.eth),
      getXrpBalance(wallet.addresses.xrp),
      getBscBalance(wallet.addresses.bnb)
    ]);

    // BTC
    const btcUsdPrice = await getUsdValueForSymbol('btc');
    const btcUsd = btcBal * btcUsdPrice;
    chainBalances.btc = { balance: btcBal, usdValue: btcUsd };
    totalBalance += btcUsd;

    // ETH
    const ethUsdPrice = await getUsdValueForSymbol('eth');
    const ethUsd = ethData.eth * ethUsdPrice;
    chainBalances.eth = { balance: ethData.eth, usdValue: ethUsd };
    totalBalance += ethUsd;

    // USDT (from Ethplorer tokens)
    const usdtToken = ethData.tokens.find(t => t.symbol === 'USDT');
    const usdtBalance = usdtToken ? usdtToken.balance : 0;
    chainBalances.usdt = { balance: usdtBalance, usdValue: usdtBalance }; // USDT ~ 1 USD

    // XRP
    const xrpUsdPrice = await getUsdValueForSymbol('xrp');
    const xrpUsd = xrpBal * xrpUsdPrice;
    chainBalances.xrp = { balance: xrpBal, usdValue: xrpUsd };
    totalBalance += xrpUsd;

    // BNB
    const bnbUsdPrice = await getUsdValueForSymbol('bnb');
    const bnbUsd = bscData.bnb * bnbUsdPrice;
    chainBalances.bnb = { balance: bscData.bnb, usdValue: bnbUsd };
    totalBalance += bnbUsd;

    // Generate QR codes for each address
    for (const chain of chains) {
      if (wallet.addresses[chain]) {
        const qrDataUrl = await QRCode.toDataURL(wallet.addresses[chain], {
          width: 120,
          margin: 1,
          color: { dark: '#6366f1', light: '#ffffff' }
        });
        qrCodes[chain] = qrDataUrl;
      }
    }
  }

  // Combine live total with manual adjustments
const combinedTotal = totalBalance + (wallet.manualBalance || 0);
return { 
  wallet, 
  hasApprovedLLC, 
  qrCodes, 
  chainBalances, 
  totalBalance: combinedTotal,   // ← now includes manual balance
  manualBalance: wallet.manualBalance || 0 
};
}

// ============================================
// WITHDRAWAL REQUEST SUBMISSION
// ============================================
const submitWithdrawal = async (req, res) => {
  try {
    console.log('=== WITHDRAWAL REQUEST START ===');
    const { chain, amount, toAddress } = req.body;
    const userId = req.session.user.id;
    console.log('Form data:', { chain, amount, toAddress, userId });

    const wallet = await WalletPool.findOne({ assignedTo: userId });
    if (!wallet) {
      console.log('No wallet found for user');
      return res.redirect('/user/wallet?error=No wallet found');
    }
    console.log('Wallet found:', wallet._id);

    const data = await getWalletData(userId);
    console.log('Total balance:', data.totalBalance, 'Requested amount:', amount);

    if (parseFloat(amount) > data.totalBalance) {
      console.log('Insufficient balance');
      return res.render('user/wallet', {
        title: 'My Wallet',
        user: req.session.user,
        ...data,
        walletUnlocked: true,
        pinError: null,
        error: 'Insufficient balance'
      });
    }

    const withdrawal = await WithdrawalRequest.create({
      userId,
      walletId: wallet._id,
      chain,
      amount: parseFloat(amount),
      toAddress,
      status: 'pending'
    });
    console.log('Withdrawal saved:', withdrawal._id);

    // Send email
    const user = await User.findById(userId);
    console.log('Sending email to:', user.email);
    const emailData = emailTemplates.withdrawalSubmitted(
      user.fullName,
      parseFloat(amount),
      chain,
      toAddress
    );
    const emailResult = await sendEmail({ 
      to: user.email, 
      subject: emailData.subject, 
      html: emailData.html 
    });
    console.log('Email sent:', emailResult);

    // Check if email was actually sent
    if (!emailResult.success) {
      console.error('Email failed:', emailResult.error);
    }

    res.redirect('/user/wallet?success=Withdrawal+request+submitted+successfully');
  } catch (error) {
    console.error('=== WITHDRAWAL ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    res.redirect('/user/wallet?error=Request+failed');
  }
};

// ============================================
// DASHBOARD
// ============================================
const getDashboard = async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    const applications = await LLCApplication.find({ userId })
      .populate('planId', 'name price')
      .sort({ createdAt: -1 });
    
    const pendingLLCs = applications.filter(a => a.status === 'pending').length;
    const approvedLLCs = applications.filter(a => a.status === 'approved').length;
    const activeLLCs = approvedLLCs;
    const hasApprovedLLC = approvedLLCs > 0;
    const recentLLCs = applications.slice(0, 3);
    
    const wallet = await WalletPool.findOne({ assignedTo: userId })
      .populate('assignedLLCId', 'desiredLLCName');

   // --- Use combined balance from getWalletData directly (no extra addition) ---
let combinedBalance = 0;
if (wallet) {
  const { totalBalance: combinedLive } = await getWalletData(userId);
  // getWalletData already includes manualBalance in totalBalance, so use it as is
  combinedBalance = combinedLive;
}

    res.render('user/dashboard', {
      title: 'Dashboard',
      user: req.session.user,
      pendingLLCs,
      approvedLLCs,
      activeLLCs,
      hasApprovedLLC,
      recentLLCs,
      wallet,
      combinedBalance   // <-- pass the combined total
    });
  } catch (error) {
    console.error('User dashboard error:', error);
    res.status(500).render('500', { title: 'Server Error' });
  }
};

// ============================================
// LLC APPLICATIONS LIST
// ============================================
const getLLCs = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const filter = req.query.status || 'all';
    
    let query = { userId };
    if (filter !== 'all') {
      query.status = filter;
    }
    
    const applications = await LLCApplication.find(query)
      .populate('planId', 'name price')
      .sort({ createdAt: -1 });
    
    for (let app of applications) {
      const wallet = await WalletPool.findOne({ assignedLLCId: app._id });
      app.walletAssigned = !!wallet;
    }
    
    res.render('user/llcs', {
      title: 'My LLCs',
      user: req.session.user,
      applications,
      filter,
      success: req.query.success || null
    });
  } catch (error) {
    console.error('Get LLCs error:', error);
    res.status(500).render('500', { title: 'Server Error' });
  }
};

// ============================================
// SINGLE LLC DETAIL
// ============================================
const getLLCDetail = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const application = await LLCApplication.findOne({
      _id: req.params.id,
      userId
    }).populate('planId', 'name price processingTime');
    
    if (!application) {
      return res.redirect('/user/llcs?error=Application not found');
    }
    
    const wallet = await WalletPool.findOne({ assignedLLCId: application._id });
    const walletAssigned = !!wallet;
    
    res.render('user/llc-detail', {
      title: 'LLC Details',
      user: req.session.user,
      application,
      walletAssigned
    });
  } catch (error) {
    console.error('Get LLC detail error:', error);
    res.redirect('/user/llcs?error=Failed to load application');
  }
};

// ============================================
// WALLET VIEW
// ============================================
const getWallet = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const wallet = await WalletPool.findOne({ assignedTo: userId })
      .populate('assignedLLCId', 'desiredLLCName');

    // If no wallet, render empty state without calling getWalletData
    if (!wallet) {
      const hasApprovedLLC = await LLCApplication.exists({ userId, status: 'approved' });
      return res.render('user/wallet', {
        title: 'My Wallet',
        user: req.session.user,
        wallet: null,
        hasApprovedLLC,
        qrCodes: {},
        chainBalances: {},
        totalBalance: 0,
        walletUnlocked: false,
        pinError: null,
        getExplorerUrl: require('../utils/blockchain').getExplorerUrl
      });
    }

    // Wallet exists – fetch live data
    const data = await getWalletData(userId);
    res.render('user/wallet', {
      title: 'My Wallet',
      user: req.session.user,
      ...data,
      walletUnlocked: false,
      pinError: null,
      getExplorerUrl: require('../utils/blockchain').getExplorerUrl
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).render('500', { title: 'Server Error' });
  }
};

// ============================================
// WALLET CREATION FLOW
// ============================================
const getCreateWallet = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const llcId = req.query.llc;

    let approvedLLC;
    if (llcId) {
      approvedLLC = await LLCApplication.findOne({
        _id: llcId,
        userId,
        status: 'approved'
      });
    } else {
      approvedLLC = await LLCApplication.findOne({
        userId,
        status: 'approved'
      }).sort({ approvedAt: -1 });
    }

    if (!approvedLLC) {
      return res.render('user/wallet-create', {
        title: 'Create Wallet',
        user: req.session.user,
        error: 'You need an approved LLC to create a wallet.'
      });
    }

    const existingWallet = await WalletPool.findOne({ assignedTo: userId });
    if (existingWallet) {
      return res.redirect('/user/wallet');
    }

    const llcWallet = await WalletPool.findOne({ assignedLLCId: approvedLLC._id });
    if (llcWallet) {
      return res.redirect('/user/wallet');
    }

    const availableWallet = await WalletPool.findOne({ status: 'available' });
    if (!availableWallet) {
      return res.render('user/wallet-create', {
        title: 'Create Wallet',
        user: req.session.user,
        error: 'No wallets available. Please contact support.'
      });
    }

    const viewToken = crypto.randomBytes(32).toString('hex');
    const viewTokenExpires = new Date(Date.now() + 30 * 60 * 1000);

    availableWallet.status = 'assigned';
    availableWallet.assignedTo = userId;
    availableWallet.assignedLLCId = approvedLLC._id;
    availableWallet.assignedAt = new Date();
    availableWallet.viewToken = viewToken;
    availableWallet.viewTokenExpires = viewTokenExpires;
    await availableWallet.save();

    res.render('user/wallet-create', {
      title: 'Create Wallet',
      user: req.session.user,
      phrase: availableWallet.recoveryPhrase,
      addresses: availableWallet.addresses,   // multi-chain object
      llcName: approvedLLC.desiredLLCName,
      walletId: availableWallet._id,
      viewToken: viewToken
    });
  } catch (error) {
    console.error('Create wallet error:', error);
    res.status(500).render('500', { title: 'Server Error' });
  }
};

// ============================================
// CONFIRM WALLET CREATION (Phrase Viewed)
// ============================================
const postConfirmWallet = async (req, res) => {
  try {
    const { walletId, viewToken } = req.body;
    const userId = req.session.user.id;

    const wallet = await WalletPool.findOne({
      _id: walletId,
      assignedTo: userId,
      status: 'assigned'
    });

    if (!wallet) {
      return res.redirect('/user/wallet?error=Invalid wallet request');
    }

    if (wallet.viewToken !== viewToken || new Date() > wallet.viewTokenExpires) {
      return res.redirect('/user/wallet?error=Session expired or invalid token');
    }

    wallet.status = 'viewed';
    wallet.hasBeenViewed = true;
    wallet.viewedAt = new Date();
    wallet.viewToken = null;
    wallet.viewTokenExpires = null;
    await wallet.save();

    const user = await User.findById(userId);
    // Use BTC address as primary display in email
    const emailData = emailTemplates.walletCreated(
      user.fullName,
      wallet.addresses.btc
    );
    await sendEmail({
      to: user.email,
      subject: emailData.subject,
      html: emailData.html
    });

    res.redirect(`/user/wallet/set-pin?walletId=${wallet._id}`);
  } catch (error) {
    console.error('Confirm wallet error:', error);
    res.redirect('/user/wallet?error=Failed to confirm wallet');
  }
};

// ============================================
// SET WALLET PIN
// ============================================
const getSetPin = async (req, res) => {
  try {
    const wallet = await WalletPool.findById(req.query.walletId);
    if (!wallet || wallet.assignedTo.toString() !== req.session.user.id) {
      return res.redirect('/user/wallet?error=Invalid wallet');
    }
    res.render('user/wallet-set-pin', {
      user: req.session.user,
      walletId: wallet._id,
      error: null
    });
  } catch (error) {
    res.redirect('/user/wallet?error=Server error');
  }
};

const postSetPin = async (req, res) => {
  try {
    const { walletId, pin } = req.body;
    if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
      return res.render('user/wallet-set-pin', {
        user: req.session.user,
        walletId,
        error: 'PIN must be exactly 6 digits'
      });
    }
    const wallet = await WalletPool.findById(walletId);
    if (!wallet || wallet.assignedTo.toString() !== req.session.user.id) {
      return res.redirect('/user/wallet?error=Invalid wallet');
    }
    wallet.pinHash = await bcrypt.hash(pin, 10);
    await wallet.save();

    // Mark session as unlocked for this session
    req.session.walletUnlocked = true;
    res.redirect('/user/wallet');
  } catch (error) {
    console.error('Set PIN error:', error);
    res.render('user/wallet-set-pin', {
      user: req.session.user,
      walletId,
      error: 'Failed to set PIN'
    });
  }
};

// ============================================
// UNLOCK WALLET via overlay (POST)
// ============================================
const postUnlockWallet = async (req, res) => {
  const { pin } = req.body;
  try {
    const wallet = await WalletPool.findOne({ assignedTo: req.session.user.id });
    if (!wallet || !wallet.pinHash) {
      return res.redirect('/user/wallet?error=No wallet found');
    }
    const match = await bcrypt.compare(pin, wallet.pinHash);
    if (!match) {
      const data = await getWalletData(req.session.user.id);
      return res.render('user/wallet', {
        title: 'My Wallet',
        user: req.session.user,
        ...data,
        walletUnlocked: false,
        pinError: 'Invalid PIN',
        getExplorerUrl
      });
    }
    // PIN correct – render the wallet fully unlocked
    const data = await getWalletData(req.session.user.id);
    res.render('user/wallet', {
      title: 'My Wallet',
      user: req.session.user,
      ...data,
      walletUnlocked: true,
      pinError: null,
      getExplorerUrl
    });
  } catch (error) {
    console.error('Unlock error:', error);
    res.redirect('/user/wallet?error=Server error');
  }
};

// ============================================
// SETTINGS
// ============================================
const getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    res.render('user/settings', {
      title: 'Settings',
      user: req.session.user,
      success: req.query.success || null,
      error: req.query.error || null,
      formData: user
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).render('500', { title: 'Server Error' });
  }
};

const postSettings = async (req, res) => {
  try {
    const { fullName, phone, street, city, state, zipCode } = req.body;
    const userId = req.session.user.id;
    await User.findByIdAndUpdate(userId, {
      fullName,
      phone,
      address: { street, city, state, zipCode, country: 'USA' }
    });
    req.session.user.fullName = fullName;
    res.redirect('/user/settings?success=Profile updated successfully');
  } catch (error) {
    console.error('Update settings error:', error);
    res.redirect('/user/settings?error=Failed to update profile');
  }
};

const postChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.user.id;
    if (newPassword !== confirmPassword) {
      return res.redirect('/user/settings?error=New passwords do not match');
    }
    const user = await User.findById(userId);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.redirect('/user/settings?error=Current password is incorrect');
    }
    user.password = newPassword;
    await user.save();
    res.redirect('/user/settings?success=Password changed successfully');
  } catch (error) {
    console.error('Change password error:', error);
    res.redirect('/user/settings?error=Failed to change password');
  }
};

// ============================================
// KYC VERIFICATION
// ============================================
const getKyc = async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    res.render('user/kyc', {
      title: 'KYC Verification',
      user: { ...user.toObject(), ...req.session.user },
      success: req.query.success,
      error: req.query.error,
      resubmit: req.query.resubmit
    });
  } catch (error) {
    res.redirect('/user/dashboard?error=Failed to load KYC page');
  }
};

const submitKyc = async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (!['not_started', 'rejected'].includes(user.kycStatus)) {
      return res.redirect('/user/kyc?error=Invalid status');
    }

    const { dateOfBirth, ssnLast4, idType, idNumber, street, city, state, zipCode } = req.body;

    const kycData = {
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      ssnLast4,
      idType,
      idNumber,
      addressDetails: { street, city, state, zipCode, country: 'USA' }
    };

    if (req.files) {
      if (req.files.idFront) {
        kycData.idFrontImage = {
          fileName: req.files.idFront[0].originalname,
          filePath: req.files.idFront[0].path,
          uploadedAt: new Date()
        };
      }
      if (req.files.idBack) {
        kycData.idBackImage = {
          fileName: req.files.idBack[0].originalname,
          filePath: req.files.idBack[0].path,
          uploadedAt: new Date()
        };
      }
      if (req.files.selfie) {
        kycData.selfieImage = {
          fileName: req.files.selfie[0].originalname,
          filePath: req.files.selfie[0].path,
          uploadedAt: new Date()
        };
      }
      if (req.files.addressDoc) {
        kycData.addressDocument = {
          fileName: req.files.addressDoc[0].originalname,
          filePath: req.files.addressDoc[0].path,
          uploadedAt: new Date()
        };
      }
    }

    user.kycData = kycData;
    user.kycStatus = 'pending';
    user.kycSubmittedAt = new Date();
    user.kycRejectionReason = undefined;
    await user.save();

    res.redirect('/user/kyc?success=Verification submitted');
  } catch (error) {
    console.error('KYC submit error:', error);
    res.redirect('/user/kyc?error=Submission failed');
  }
};

const resubmitKyc = async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (user.kycStatus === 'rejected') {
      user.kycStatus = 'not_submitted';
      await user.save();
    }
    res.redirect('/user/kyc');
  } catch (error) {
    res.redirect('/user/kyc?error=Could not reset');
  }
};

// ============================================
// EXPORTS
// ============================================
module.exports = {
  getDashboard,
  getLLCs,
  getLLCDetail,
  getWallet,
  getCreateWallet,
  postConfirmWallet,
  getSetPin,
  postSetPin,
  postUnlockWallet,
  getSettings,
  postSettings,
  postChangePassword,
  getKyc,
  submitKyc,
  resubmitKyc,
  submitWithdrawal,
  getWalletData   // exported for potential reuse
};