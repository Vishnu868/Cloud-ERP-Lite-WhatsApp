dmin/manager, show only their leaves
    if (req.user.role === 'EMPLOYEE') {
      const employee = await prisma.employee.findUnique({
        where: { userId: req.user.id }
      });
      
      if (employee) {
        where.employeeId = employee.id;
      }
    }

    const [leaveRequests, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          employee: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                  phone: true
                }
              }
            }
          },
          approver: {
            select: {
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.leaveRequest.count({ where })
    ]);

    res.json({
      success: true,
      count: leaveRequests.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: leaveRequests
    });
  } catch (error) {
    console.error('Get leave requests error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// @desc    Get single leave request
// @route   GET /api/leaves/:id
// @access  Private
export const getLeaveRequest = async (req, res) => {
  try {
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id },
      include: {
        employee: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                phone: true
              }
            }
          }
        },
        approver: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (!leaveRequest) {
      return res.status(404).json({ 
        success: false,
        message: 'Leave request not found' 
      });
    }

    res.json({
      success: true,
      data: leaveRequest
    });
  } catch (error) {
    console.error('Get leave request error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// @desc    Create leave request
// @route   POST /api/leaves
// @access  Private
export const createLeaveRequest = async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.body;

    // Get employee record for current user
    const employee = await prisma.employee.findUnique({
      where: { userId: req.user.id }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found. Please contact administrator.'
      });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        leaveType,
        startDate: start,
        endDate: end,
        reason
      },
      include: {
        employee: {
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: leaveRequest
    });
  } catch (error) {
    console.error('Create leave request error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// @desc    Update leave request
// @route   PUT /api/leaves/:id
// @access  Private
export const updateLeaveRequest = async (req, res) => {
  try {
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id },
      include: { employee: true }
    });

    if (!leaveRequest) {
      return res.status(404).json({ 
        success: false,
        message: 'Leave request not found' 
      });
    }

    // Check if user owns this leave request
    if (leaveRequest.employee.userId !== req.user.id && 
        !['ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this leave request'
      });
    }

    // Can only update if status is PENDING
    if (leaveRequest.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update leave request that has been processed'
      });
    }

    const updatedLeaveRequest = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: req.body
    });

    res.json({
      success: true,
      data: updatedLeaveRequest
    });
  } catch (error) {
    console.error('Update leave request error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// @desc    Approve leave request
// @route   PUT /api/leaves/:id/approve
// @access  Private (Admin, Manager)
export const approveLeaveRequest = async (req, res) => {
  try {
    const { comments } = req.body;

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id }
    });

    if (!leaveRequest) {
      return res.status(404).json({ 
        success: false,
        message: 'Leave request not found' 
      });
    }

    if (leaveRequest.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Leave request has already been processed'
      });
    }

    const updatedLeaveRequest = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED',
        approvedBy: req.user.id,
        approvalDate: new Date(),
        comments
      },
      include: {
        employee: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                phone: true
              }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Leave request approved successfully',
      data: updatedLeaveRequest
    });
  } catch (error) {
    console.error('Approve leave request error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// @desc    Reject leave request
// @route   PUT /api/leaves/:id/reject
// @access  Private (Admin, Manager)
export const rejectLeaveRequest = async (req, res) => {
  try {
    const { comments } = req.body;

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id }
    });

    if (!leaveRequest) {
      return res.status(404).json({ 
        success: false,
        message: 'Leave request not found' 
      });
    }

    if (leaveRequest.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Leave request has already been processed'
      });
    }

    const updatedLeaveRequest = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        approvedBy: req.user.id,
        approvalDate: new Date(),
        comments
      },
      include: {
        employee: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                phone: true
              }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Leave request rejected',
      data: updatedLeaveRequest
    });
  } catch (error) {
    console.error('Reject leave request error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// @desc    Delete leave request
// @route   DELETE /api/leaves/:id
// @access  Private
export const deleteLeaveRequest = async (req, res) => {
  try {
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id },
      include: { employee: true }
    });

    if (!leaveRequest) {
      return res.status(404).json({ 
        success: false,
        message: 'Leave request not found' 
      });
    }

    // Check if user owns this leave request or is admin/manager
    if (leaveRequest.employee.userId !== req.user.id && 
        !['ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this leave request'
      });
    }

    await prisma.leaveRequest.delete({
      where: { id: req.params.id }
    });

    res.json({
      success: true,
      message: 'Leave request deleted successfully'
    });
  } catch (error) {
    console.error('Delete leave request error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                