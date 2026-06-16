const mongoose = require('mongoose');

const LLCApplicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  state: { type: String, required: true },
  desiredLLCName: { type: String, required: true },
  alternativeLLCName1: { type: String, required: true },
  alternativeLLCName2: { type: String, required: true },
  businessAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    county: String
  },
  registeredAgent: { type: String, enum: ['zen_business', 'self'], default: 'zen_business' },
  memberName: { type: String, required: true },
  memberTitle: { type: String, default: 'Managing Member' },
  memberOwnership: { type: Number, min: 1, max: 100, default: 100 },
  businessPurpose: { type: String, required: true, enum: ['crypto_trading', 'nft', 'defi', 'mining', 'consulting', 'dao', 'other'] },
  businessPurposeOther: String,
  documents: [{
    fileName: String,
    filePath: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  status: { type: String, enum: ['incomplete', 'pending', 'approved', 'rejected', 'deleted'], default: 'incomplete' },
  adminNotes: String,
  rejectionReason: String,
  approvedAt: Date,
  rejectedAt: Date,
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  paymentAmount: Number,
  paymentDate: Date,
  transactionId: String,
  submittedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ CORRECT ASYNC PRE‑SAVE HOOK – NO next PARAMETER
LLCApplicationSchema.pre('save', async function() {
  this.updatedAt = new Date();
  if (this.status === 'pending' && !this.submittedAt) {
    this.submittedAt = new Date();
  }
});

module.exports = mongoose.model('LLCApplication', LLCApplicationSchema);
