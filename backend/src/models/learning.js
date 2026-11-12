import mongoose from "mongoose";

// Learning data is stored as flexible documents keyed by owner + item id:
// courses (roadmaps), extracted chapter text, progress per course, learner stats.
const keyedSchema = () => {
  const schema = new mongoose.Schema({
    ownerId: { type: String, required: true, index: true, maxlength: 255 },
    itemId: { type: String, required: true, maxlength: 128 },
    status: { type: String, default: "", index: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
  }, { timestamps: true, minimize: false });
  schema.index({ ownerId: 1, itemId: 1 }, { unique: true });
  return schema;
};

export const Course = mongoose.models.Course || mongoose.model("Course", keyedSchema());
export const CourseSource = mongoose.models.CourseSource || mongoose.model("CourseSource", keyedSchema());
export const CourseProgress = mongoose.models.CourseProgress || mongoose.model("CourseProgress", keyedSchema());
export const Learner = mongoose.models.Learner || mongoose.model("Learner", keyedSchema());
