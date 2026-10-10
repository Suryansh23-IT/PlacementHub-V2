import mongoose from 'mongoose'
import {assertAiRuntime} from './ai.guard.js'
// Registered only by the exact current runtime; no archived model/collection initialization.
export function createAdminInsightModel(config) {
  assertAiRuntime(config)
  if(mongoose.models.AdminAiInsight)return mongoose.models.AdminAiInsight
  const item=new mongoose.Schema({text:{type:String,required:true,maxlength:240},evidenceRefs:{type:[String],required:true}},{_id:false,strict:'throw'})
  const insight=new mongoose.Schema({summary:{type:String,required:true,maxlength:400},evidenceRefs:{type:[String],required:true},highlights:[item],concerns:[item],recommendations:[item]},{_id:false,strict:'throw'})
  return mongoose.model('AdminAiInsight',new mongoose.Schema({scope:{type:String,required:true,unique:true,enum:['2027-placement']},insight:{type:insight,required:true},analyzedAt:{type:Date,required:true},contextFingerprint:{type:String,required:true,match:/^[a-f0-9]{64}$/},provider:{type:String,required:true},model:{type:String,required:true},contractVersion:{type:String,required:true}},{strict:'throw'}))
}
