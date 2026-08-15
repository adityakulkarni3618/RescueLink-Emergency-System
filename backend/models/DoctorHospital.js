const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DoctorHospital = sequelize.define('DoctorHospital', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    doctorId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    hospitalId: {
      type: DataTypes.UUID,
      allowNull: false
    }
  }, {
    tableName: 'doctor_hospitals',
    timestamps: true
  });

  return DoctorHospital;
};
