const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Hospital = sequelize.define('Hospital', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    city: {
      type: DataTypes.STRING
    },
    state: {
      type: DataTypes.STRING
    },
    lat: {
      type: DataTypes.FLOAT
    },
    lng: {
      type: DataTypes.FLOAT
    },
    contact_number: {
      type: DataTypes.STRING
    },
    total_beds: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    icu_beds: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    ventilators: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    license_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    departments: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]'
    },
    bay_capacity: {
      type: DataTypes.INTEGER,
      defaultValue: 5
    },
    bed_statuses: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]'
    },
    trauma_tier: {
      type: DataTypes.STRING,
      allowNull: true
    },
    accreditation_id: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'hospitals',
    timestamps: true
  });

  return Hospital;
};
