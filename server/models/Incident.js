const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Incident = sequelize.define('Incident', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    patient_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    ambulance_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    paramedic_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    hospital_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('requested', 'dispatched', 'en_route', 'arrived', 'completed', 'cancelled'),
      defaultValue: 'requested'
    },
    pickup_lat: {
      type: DataTypes.FLOAT
    },
    pickup_lng: {
      type: DataTypes.FLOAT
    },
    pickup_address: {
      type: DataTypes.STRING
    },
    news2_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    vitals_log: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    gps_log: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    notes: {
      type: DataTypes.TEXT
    },
    started_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    completed_at: {
      type: DataTypes.DATE
    },
    razorpay_order_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    payment_status: {
      type: DataTypes.ENUM('pending', 'paid', 'insurance', 'waived'),
      defaultValue: 'pending'
    },
    fhir_class: {
      type: DataTypes.STRING,
      defaultValue: 'EMER'
    },
    fhir_priority: {
      type: DataTypes.STRING,
      defaultValue: 'routine'
    }
  }, {
    tableName: 'incidents',
    timestamps: true
  });

  return Incident;
};
