/**
 * CRM 路由（M2 后端）
 * 读操作：authedQuery（CEO 只读）
 * 写操作：adminWrite（仅总助可写）
 */
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, adminWrite } from "./middleware";
import { getDb } from "./queries/connection";
import {
  accounts,
  contacts,
  opportunities,
  activities,
  suppliers,
  investors,
  rfqs,
  suppliersQualityEvents,
  docs,
  samples,
  SAMPLE_STATUS,
  RFQ_STATUS,
  DOC_KINDS,
  SUPPLIER_STAGES,
  INVESTOR_STAGES,
  ACCOUNT_STAGES,
  ACCOUNT_RELATIONSHIP_TYPES,
  companyLibrary,
  fundingEvents,
  followups,
  FOLLOWUP_ENTITY_TYPES,
} from "@db/schema";
import { REL_TYPES, isArchivedStage, type RelationshipType } from "@contracts/crm";
import {
  CMD_ACCOUNT_KINDS,
  CMD_CONTACT_ROLES,
  CMD_OPP_STAGES,
  CMD_ACTIVITY_KINDS,
  DAY_RE,
} from "@contracts/commands";
import { dayFmt, addDays } from "./helpers";
import { insertCrmActivity } from "./crm-helpers";

/** 商机阶段默认成交概率（%），用于 summary 加权估算 */
const STAGE_PROB: Record<(typeof CMD_OPP_STAGES)[number], number> = {
  identify: 10,
  tech_discussion: 20,
  proposal_quote: 40,
  sample_poc: 60,
  contract: 80,
  delivery: 90,
  won: 100,
  lost: 0,
};

const idInput = z.object({ id: z.number().int().positive() });
const accountKindSchema = z.enum(CMD_ACCOUNT_KINDS);
const accountStageSchema = z.enum(ACCOUNT_STAGES);
const contactRoleSchema = z.enum(CMD_CONTACT_ROLES);
const oppStageSchema = z.enum(CMD_OPP_STAGES);
const activityKindSchema = z.enum(CMD_ACTIVITY_KINDS);

const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sampleStatusSchema = z.enum(SAMPLE_STATUS);
const rfqStatusSchema = z.enum(RFQ_STATUS);
const docKindSchema = z.enum(DOC_KINDS);
const supplierRiskSchema = z.enum(["H", "M", "L"]);

export const crmRouter = createRouter({
  account: createRouter({
    /** 全部客户，按名称升序 */
    list: authedQuery.query(() =>
      getDb().select().from(accounts).orderBy(asc(accounts.name)),
    ),

    create: adminWrite
      .input(
        z.object({
          name: z.string().trim().min(1).max(255),
          kind: accountKindSchema.default("company"),
          industry: z.string().max(64).nullish(),
          source: z.string().max(32).nullish(),
          stage: accountStageSchema.default("prospect"),
        }),
      )
      .mutation(async ({ input }) => {
        const [res] = await getDb()
          .insert(accounts)
          .values({
            name: input.name,
            kind: input.kind,
            industry: input.industry ?? null,
            source: input.source ?? null,
            stage: input.stage,
          });
        return { id: Number(res.insertId) };
      }),

    update: adminWrite
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            name: z.string().min(1).max(255).optional(),
            kind: accountKindSchema.optional(),
            relationshipType: z.enum(ACCOUNT_RELATIONSHIP_TYPES).optional(),
            industry: z.string().max(64).nullish(),
            source: z.string().max(32).nullish(),
            stage: accountStageSchema.optional(),
            tags: z.string().max(500).nullish(),
            memo: z.string().nullish(),
            website: z.string().max(500).nullish(),
            location: z.string().max(255).nullish(),
            nextActionAt: d.nullish(),
            lastContactAt: d.nullish(),
            /** 结构定稿 v3 字段 */
            product: z.string().max(255).nullish(),
            businessModel: z.string().max(120).nullish(),
            cooperation: z.string().max(500).nullish(),
            organism: z.string().max(120).nullish(),
            maturity: z.string().max(24).nullish(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const p = input.patch;
        const set: Partial<typeof accounts.$inferInsert> = {};
        if (p.name !== undefined) set.name = p.name;
        if (p.kind !== undefined) set.kind = p.kind;
        if (p.relationshipType !== undefined) set.relationshipType = p.relationshipType;
        if (p.industry !== undefined) set.industry = p.industry;
        if (p.source !== undefined) set.source = p.source;
        if (p.stage !== undefined) set.stage = p.stage;
        if (p.tags !== undefined) set.tags = p.tags;
        if (p.memo !== undefined) set.memo = p.memo;
        if (p.website !== undefined) set.website = p.website;
        if (p.location !== undefined) set.location = p.location;
        if (p.nextActionAt !== undefined) set.nextActionAt = p.nextActionAt;
        if (p.lastContactAt !== undefined) set.lastContactAt = p.lastContactAt;
        if (p.product !== undefined) set.product = p.product;
        if (p.businessModel !== undefined) set.businessModel = p.businessModel;
        if (p.cooperation !== undefined) set.cooperation = p.cooperation;
        if (p.organism !== undefined) set.organism = p.organism;
        if (p.maturity !== undefined) set.maturity = p.maturity;
        await getDb().update(accounts).set(set).where(eq(accounts.id, input.id));
      }),

    /** 删除客户，并先级联删除其联系人 */
    remove: adminWrite.input(idInput).mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(contacts).where(eq(contacts.accountId, input.id));
      await db.delete(accounts).where(eq(accounts.id, input.id));
    }),
  }),

  contact: createRouter({
    /** 人脉簿：全部人（可无机构挂靠） */
    list: authedQuery.query(() => getDb().select().from(contacts).orderBy(asc(contacts.name))),

    listByAccount: authedQuery
      .input(z.object({ accountId: z.number().int().positive() }))
      .query(({ input }) =>
        getDb().select().from(contacts).where(eq(contacts.accountId, input.accountId)).orderBy(asc(contacts.name)),
      ),

    create: adminWrite
      .input(
        z.object({
          accountId: z.number().int().positive().nullish(),
          name: z.string().trim().min(1).max(120),
          roleInDeal: contactRoleSchema.nullish(),
          title: z.string().max(120).nullish(),
          email: z.string().max(255).nullish(),
          wechat: z.string().max(120).nullish(),
          phone: z.string().max(60).nullish(),
          stance: z.string().max(16).nullish(),
          influence: z.string().max(1).nullish(),
        }),
      )
      .mutation(async ({ input }) => {
        const [res] = await getDb().insert(contacts).values({
          accountId: input.accountId ?? null,
          name: input.name,
          roleInDeal: input.roleInDeal ?? null,
          title: input.title ?? null,
          email: input.email ?? null,
          wechat: input.wechat ?? null,
          phone: input.phone ?? null,
          stance: input.stance ?? null,
          influence: input.influence ?? null,
        });
        return { id: Number(res.insertId) };
      }),

    update: adminWrite
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            name: z.string().min(1).max(120).optional(),
            accountId: z.number().int().positive().nullish(),
            roleInDeal: contactRoleSchema.nullish(),
            title: z.string().max(120).nullish(),
            email: z.string().max(255).nullish(),
            wechat: z.string().max(120).nullish(),
            phone: z.string().max(60).nullish(),
            stance: z.string().max(16).nullish(),
            influence: z.string().max(1).nullish(),
            memo: z.string().nullish(),
            /** v2 人脉簿字段 */
            roleType: z.string().max(32).nullish(),
            outreachStage: z.string().max(24).nullish(),
            linkedinUrl: z.string().max(255).nullish(),
            referral: z.string().max(255).nullish(),
            tags: z.string().max(500).nullish(),
            emailKind: z.string().max(16).nullish(),
            affiliation: z.string().max(255).nullish(),
            lastContactAt: d.nullish(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const p = input.patch;
        const set: Partial<typeof contacts.$inferInsert> = {};
        if (p.name !== undefined) set.name = p.name;
        if (p.accountId !== undefined) set.accountId = p.accountId;
        if (p.roleInDeal !== undefined) set.roleInDeal = p.roleInDeal;
        if (p.title !== undefined) set.title = p.title;
        if (p.email !== undefined) set.email = p.email;
        if (p.wechat !== undefined) set.wechat = p.wechat;
        if (p.phone !== undefined) set.phone = p.phone;
        if (p.stance !== undefined) set.stance = p.stance;
        if (p.influence !== undefined) set.influence = p.influence;
        if (p.memo !== undefined) set.memo = p.memo;
        if (p.roleType !== undefined) set.roleType = p.roleType;
        if (p.outreachStage !== undefined) set.outreachStage = p.outreachStage;
        if (p.linkedinUrl !== undefined) set.linkedinUrl = p.linkedinUrl;
        if (p.referral !== undefined) set.referral = p.referral;
        if (p.tags !== undefined) set.tags = p.tags;
        if (p.emailKind !== undefined) set.emailKind = p.emailKind;
        if (p.lastContactAt !== undefined) set.lastContactAt = p.lastContactAt;
        await getDb().update(contacts).set(set).where(eq(contacts.id, input.id));
      }),

    remove: adminWrite.input(idInput).mutation(async ({ input }) => {
      await getDb().delete(contacts).where(eq(contacts.id, input.id));
    }),
  }),

  opportunity: createRouter({
    /** 全部商机；可按 stage 过滤 */
    list: authedQuery
      .input(z.object({ stage: oppStageSchema.optional() }))
      .query(({ input }) => {
        const where = input.stage ? eq(opportunities.stage, input.stage) : undefined;
        return getDb()
          .select()
          .from(opportunities)
          .where(where)
          .orderBy(desc(opportunities.createdAt));
      }),

    create: adminWrite
      .input(
        z.object({
          accountId: z.number().int().positive(),
          title: z.string().trim().min(1).max(255),
          stage: oppStageSchema.default("identify"),
          amountCny: z.number().min(0).nullish(),
          expectedClose: z.string().regex(DAY_RE).nullish(),
          source: z.string().max(32).nullish(),
        }),
      )
      .mutation(async ({ input }) => {
        const [res] = await getDb().insert(opportunities).values({
          accountId: input.accountId,
          title: input.title,
          stage: input.stage,
          amountCny: input.amountCny != null ? String(input.amountCny) : null,
          expectedClose: input.expectedClose ?? null,
          source: input.source ?? null,
        });
        return { id: Number(res.insertId) };
      }),

    update: adminWrite
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            stage: oppStageSchema.optional(),
            amountCny: z.number().min(0).nullish(),
            probability: z.number().int().min(0).max(100).nullish(),
            expectedClose: z.string().regex(DAY_RE).nullish(),
            nextAction: z.string().max(500).nullish(),
            nextActionDue: z.string().regex(DAY_RE).nullish(),
            lostReason: z.string().max(255).nullish(),
            wonAt: z.string().regex(DAY_RE).nullish(),
            memo: z.string().nullish(),
            tags: z.string().max(500).nullish(),
            techDiscussionDone: z.boolean().optional(),
            proposalSent: z.boolean().optional(),
            sampleSent: z.boolean().optional(),
            pocPassed: z.boolean().optional(),
            ndaSigned: z.boolean().optional(),
            contractSigned: z.boolean().optional(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const p = input.patch;
        if (p.stage === "lost" && !p.lostReason) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "必填原因" });
        }

        const set: Partial<typeof opportunities.$inferInsert> = {};
        if (p.stage !== undefined) set.stage = p.stage;
        if (p.stage === "won") set.wonAt = dayFmt(new Date());
        if (p.stage === "lost") {
          set.lostReason = p.lostReason ?? null;
        }
        if (p.amountCny !== undefined) set.amountCny = p.amountCny != null ? String(p.amountCny) : null;
        if (p.probability !== undefined) set.probability = p.probability;
        if (p.expectedClose !== undefined) set.expectedClose = p.expectedClose;
        if (p.nextAction !== undefined) set.nextAction = p.nextAction;
        if (p.nextActionDue !== undefined) set.nextActionDue = p.nextActionDue;
        if (p.lostReason !== undefined && p.stage !== "lost") set.lostReason = p.lostReason;
        if (p.wonAt !== undefined) set.wonAt = p.wonAt;
        if (p.memo !== undefined) set.memo = p.memo;
        if (p.tags !== undefined) set.tags = p.tags;
        if (p.techDiscussionDone !== undefined) set.techDiscussionDone = p.techDiscussionDone;
        if (p.proposalSent !== undefined) set.proposalSent = p.proposalSent;
        if (p.sampleSent !== undefined) set.sampleSent = p.sampleSent;
        if (p.pocPassed !== undefined) set.pocPassed = p.pocPassed;
        if (p.ndaSigned !== undefined) set.ndaSigned = p.ndaSigned;
        if (p.contractSigned !== undefined) set.contractSigned = p.contractSigned;

        await getDb().update(opportunities).set(set).where(eq(opportunities.id, input.id));
      }),

    remove: adminWrite.input(idInput).mutation(async ({ input }) => {
      await getDb().delete(opportunities).where(eq(opportunities.id, input.id));
    }),

    /** 商机漏斗汇总 */
    summary: authedQuery.query(async () => {
      const db = getDb();
      const rows = await db.select().from(opportunities);

      const byStage: Record<string, { count: number; amount: number }> = {};
      let totalAmount = 0;
      let weighted = 0;
      let staleCount = 0;
      let nextDueCount = 0;

      const staleBefore = dayFmt(addDays(new Date(), -14));
      const dueBefore = dayFmt(addDays(new Date(), 7));

      for (const row of rows) {
        const amount = row.amountCny ? Number(row.amountCny) : 0;
        const stage = row.stage;
        byStage[stage] = byStage[stage] ?? { count: 0, amount: 0 };
        byStage[stage].count += 1;
        byStage[stage].amount += amount;
        totalAmount += amount;

        const prob = (row.probability ?? STAGE_PROB[stage as keyof typeof STAGE_PROB] ?? 0) / 100;
        weighted += amount * prob;

        if (stage !== "won" && stage !== "lost") {
          if (!row.lastActivityAt || row.lastActivityAt < new Date(`${staleBefore}T00:00:00`)) {
            staleCount += 1;
          }
          if (row.nextActionDue && row.nextActionDue <= dueBefore) {
            nextDueCount += 1;
          }
        }
      }

      return { byStage, totalAmount, weighted, staleCount, nextDueCount };
    }),
  }),

  activity: createRouter({
    /** 按主体列出沟通记录，时间倒序 */
    list: authedQuery
      .input(
        z.object({
          subjectType: z.enum(["opportunity", "account"]),
          subjectId: z.number().int().positive(),
        }),
      )
      .query(({ input }) =>
        getDb()
          .select()
          .from(activities)
          .where(and(eq(activities.subjectType, input.subjectType), eq(activities.subjectId, input.subjectId)))
          .orderBy(desc(activities.happenedAt)),
      ),

    create: adminWrite
      .input(
        z.object({
          subjectType: z.enum(["opportunity", "account"]),
          subjectId: z.number().int().positive(),
          kind: activityKindSchema.default("other"),
          summary: z.string().trim().min(1).max(2000),
          nextActionAt: z.string().regex(DAY_RE).nullish(),
        }),
      )
      .mutation(async ({ input }) => {
        await getDb().transaction(async (tx) => {
          await insertCrmActivity(tx, {
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            kind: input.kind,
            summary: input.summary,
            nextActionAt: input.nextActionAt ?? null,
          });
        });
      }),
  }),

  sample: createRouter({
    list: authedQuery
      .input(
        z.object({
          opportunityId: z.number().int().positive().optional(),
          accountId: z.number().int().positive().optional(),
        }),
      )
      .query(({ input }) => {
        const conds = [];
        if (input.opportunityId) conds.push(eq(samples.opportunityId, input.opportunityId));
        if (input.accountId) conds.push(eq(samples.accountId, input.accountId));
        const where = conds.length ? and(...conds) : undefined;
        return getDb().select().from(samples).where(where).orderBy(desc(samples.id));
      }),

    create: adminWrite
      .input(
        z.object({
          opportunityId: z.number().int().positive().nullish(),
          accountId: z.number().int().positive().nullish(),
          title: z.string().trim().min(1).max(255),
          qtySpec: z.string().max(120).nullish(),
          sentAt: d.nullish(),
          tracking: z.string().max(120).nullish(),
          status: sampleStatusSchema.default("requested"),
        }),
      )
      .mutation(async ({ input }) => {
        const [res] = await getDb().insert(samples).values({
          opportunityId: input.opportunityId ?? null,
          accountId: input.accountId ?? null,
          title: input.title,
          qtySpec: input.qtySpec ?? null,
          sentAt: input.sentAt ?? null,
          tracking: input.tracking ?? null,
          status: input.status,
        });
        return { id: Number(res.insertId) };
      }),

    update: adminWrite
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            status: sampleStatusSchema.optional(),
            feedback: z.string().max(2000).nullish(),
            followUpAt: d.nullish(),
            sentAt: d.nullish(),
            tracking: z.string().max(120).nullish(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const p = input.patch;
        const set: Partial<typeof samples.$inferInsert> = {};
        if (p.status !== undefined) set.status = p.status;
        if (p.feedback !== undefined) set.feedback = p.feedback;
        if (p.followUpAt !== undefined) set.followUpAt = p.followUpAt;
        if (p.sentAt !== undefined) set.sentAt = p.sentAt;
        if (p.tracking !== undefined) set.tracking = p.tracking;
        await getDb().update(samples).set(set).where(eq(samples.id, input.id));
      }),

    remove: adminWrite.input(idInput).mutation(async ({ input }) => {
      await getDb().delete(samples).where(eq(samples.id, input.id));
    }),
  }),

  supplier: createRouter({
    list: authedQuery.query(() => getDb().select().from(suppliers).orderBy(asc(suppliers.name))),

    create: adminWrite
      .input(
        z.object({
          name: z.string().trim().min(1).max(255),
          category: z.string().max(32).nullish(),
          contactName: z.string().max(120).nullish(),
          contactPhone: z.string().max(60).nullish(),
          contactWechat: z.string().max(120).nullish(),
          amountCny: z.number().min(0).nullish(),
          startDate: d.nullish(),
          endDate: d.nullish(),
          accountTerms: z.string().max(120).nullish(),
          singleSource: z.boolean().default(false),
          risk: supplierRiskSchema.nullish(),
          memo: z.string().nullish(),
        }),
      )
      .mutation(async ({ input }) => {
        const [res] = await getDb().insert(suppliers).values({
          name: input.name,
          category: input.category ?? null,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          contactWechat: input.contactWechat ?? null,
          amountCny: input.amountCny != null ? String(input.amountCny) : null,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          accountTerms: input.accountTerms ?? null,
          singleSource: input.singleSource,
          risk: input.risk ?? null,
          memo: input.memo ?? null,
        });
        return { id: Number(res.insertId) };
      }),

    update: adminWrite
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            name: z.string().min(1).max(255).optional(),
            category: z.string().max(32).nullish(),
            contactName: z.string().max(120).nullish(),
            contactPhone: z.string().max(60).nullish(),
            contactWechat: z.string().max(120).nullish(),
            stage: z.enum(SUPPLIER_STAGES).optional(),
            amountCny: z.number().min(0).nullish(),
            startDate: d.nullish(),
            endDate: d.nullish(),
            accountTerms: z.string().max(120).nullish(),
            singleSource: z.boolean().nullish(),
            risk: supplierRiskSchema.nullish(),
            memo: z.string().nullish(),
            tags: z.string().max(500).nullish(),
            location: z.string().max(255).nullish(),
            ndaSigned: z.boolean().nullish(),
            ndaDate: d.nullish(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const p = input.patch;
        const set: Partial<typeof suppliers.$inferInsert> = {};
        if (p.name !== undefined) set.name = p.name;
        if (p.category !== undefined) set.category = p.category;
        if (p.contactName !== undefined) set.contactName = p.contactName;
        if (p.contactPhone !== undefined) set.contactPhone = p.contactPhone;
        if (p.contactWechat !== undefined) set.contactWechat = p.contactWechat;
        if (p.stage !== undefined) set.stage = p.stage;
        if (p.amountCny !== undefined) set.amountCny = p.amountCny != null ? String(p.amountCny) : null;
        if (p.startDate !== undefined) set.startDate = p.startDate;
        if (p.endDate !== undefined) set.endDate = p.endDate;
        if (p.accountTerms !== undefined) set.accountTerms = p.accountTerms;
        if (p.singleSource !== undefined) set.singleSource = p.singleSource ?? false;
        if (p.risk !== undefined) set.risk = p.risk;
        if (p.memo !== undefined) set.memo = p.memo;
        if (p.tags !== undefined) set.tags = p.tags;
        if (p.location !== undefined) set.location = p.location;
        if (p.ndaSigned !== undefined) set.ndaSigned = p.ndaSigned;
        if (p.ndaDate !== undefined) set.ndaDate = p.ndaDate;
        await getDb().update(suppliers).set(set).where(eq(suppliers.id, input.id));
      }),

    remove: adminWrite.input(idInput).mutation(async ({ input }) => {
      await getDb().delete(suppliers).where(eq(suppliers.id, input.id));
    }),
  }),

  rfq: createRouter({
    list: authedQuery
      .input(z.object({ supplierId: z.number().int().positive().optional() }))
      .query(({ input }) => {
        const where = input.supplierId ? eq(rfqs.supplierId, input.supplierId) : undefined;
        return getDb().select().from(rfqs).where(where).orderBy(desc(rfqs.id));
      }),

    create: adminWrite
      .input(
        z.object({
          supplierId: z.number().int().positive(),
          item: z.string().trim().min(1).max(255),
          qty: z.string().max(120).nullish(),
          priceCny: z.number().min(0).nullish(),
          deliveryDays: z.number().int().min(0).nullish(),
          validUntil: d.nullish(),
          status: rfqStatusSchema.default("asking"),
          memo: z.string().max(500).nullish(),
        }),
      )
      .mutation(async ({ input }) => {
        const [res] = await getDb().insert(rfqs).values({
          supplierId: input.supplierId,
          item: input.item,
          qty: input.qty ?? null,
          priceCny: input.priceCny != null ? String(input.priceCny) : null,
          deliveryDays: input.deliveryDays ?? null,
          validUntil: input.validUntil ?? null,
          status: input.status,
          memo: input.memo ?? null,
        });
        return { id: Number(res.insertId) };
      }),

    update: adminWrite
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            priceCny: z.number().min(0).nullish(),
            deliveryDays: z.number().int().min(0).nullish(),
            status: rfqStatusSchema.optional(),
            validUntil: d.nullish(),
            memo: z.string().max(500).nullish(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const p = input.patch;
        const set: Partial<typeof rfqs.$inferInsert> = {};
        if (p.priceCny !== undefined) set.priceCny = p.priceCny != null ? String(p.priceCny) : null;
        if (p.deliveryDays !== undefined) set.deliveryDays = p.deliveryDays;
        if (p.status !== undefined) set.status = p.status;
        if (p.validUntil !== undefined) set.validUntil = p.validUntil;
        if (p.memo !== undefined) set.memo = p.memo;
        await getDb().update(rfqs).set(set).where(eq(rfqs.id, input.id));
      }),

    remove: adminWrite.input(idInput).mutation(async ({ input }) => {
      await getDb().delete(rfqs).where(eq(rfqs.id, input.id));
    }),
  }),

  qualityEvent: createRouter({
    list: authedQuery
      .input(z.object({ supplierId: z.number().int().positive().optional() }))
      .query(({ input }) => {
        const where = input.supplierId ? eq(suppliersQualityEvents.supplierId, input.supplierId) : undefined;
        return getDb()
          .select()
          .from(suppliersQualityEvents)
          .where(where)
          .orderBy(desc(suppliersQualityEvents.id));
      }),

    create: adminWrite
      .input(
        z.object({
          supplierId: z.number().int().positive(),
          kind: z.enum(["delay", "quality", "service"]),
          summary: z.string().trim().min(1).max(1000),
          impact: z.string().max(500).nullish(),
          resolvedAt: d.nullish(),
        }),
      )
      .mutation(async ({ input }) => {
        const [res] = await getDb().insert(suppliersQualityEvents).values({
          supplierId: input.supplierId,
          kind: input.kind,
          summary: input.summary,
          impact: input.impact ?? null,
          resolvedAt: input.resolvedAt ?? null,
        });
        return { id: Number(res.insertId) };
      }),

    update: adminWrite
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            resolvedAt: d.nullish(),
            summary: z.string().min(1).max(1000).optional(),
            impact: z.string().max(500).nullish(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const p = input.patch;
        const set: Partial<typeof suppliersQualityEvents.$inferInsert> = {};
        if (p.resolvedAt !== undefined) set.resolvedAt = p.resolvedAt;
        if (p.summary !== undefined) set.summary = p.summary;
        if (p.impact !== undefined) set.impact = p.impact;
        await getDb().update(suppliersQualityEvents).set(set).where(eq(suppliersQualityEvents.id, input.id));
      }),

    remove: adminWrite.input(idInput).mutation(async ({ input }) => {
      await getDb().delete(suppliersQualityEvents).where(eq(suppliersQualityEvents.id, input.id));
    }),
  }),

  doc: createRouter({
    list: authedQuery
      .input(
        z.object({
          subjectType: z.enum(["account", "opportunity", "sample", "supplier", "rfq"]),
          subjectId: z.number().int().positive(),
        }),
      )
      .query(({ input }) =>
        getDb()
          .select()
          .from(docs)
          .where(and(eq(docs.subjectType, input.subjectType), eq(docs.subjectId, input.subjectId)))
          .orderBy(desc(docs.id)),
      ),

    create: adminWrite
      .input(
        z.object({
          subjectType: z.enum(["account", "opportunity", "sample", "supplier", "rfq"]),
          subjectId: z.number().int().positive(),
          kind: docKindSchema.nullish(),
          title: z.string().trim().min(1).max(255),
          url: z.string().max(1000).nullish(),
          version: z.number().int().positive().default(1),
        }),
      )
      .mutation(async ({ input }) => {
        const [res] = await getDb().insert(docs).values({
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          kind: input.kind ?? null,
          title: input.title,
          url: input.url ?? null,
          version: input.version,
        });
        return { id: Number(res.insertId) };
      }),

    remove: adminWrite.input(idInput).mutation(async ({ input }) => {
      await getDb().delete(docs).where(eq(docs.id, input.id));
    }),
  }),

  /** 统一「关系」模型：客户/顾问/合作方(accounts) + 供应商(suppliers) + 投资人(investors) */
  relationship: createRouter({
    list: authedQuery.query(async () => {
      const [acctRows, suppRows, invRows] = await Promise.all([
        getDb().select().from(accounts).orderBy(desc(accounts.updatedAt)),
        getDb().select().from(suppliers).orderBy(desc(suppliers.updatedAt)),
        getDb().select().from(investors).orderBy(desc(investors.updatedAt)),
      ]);
      const items = [
        ...acctRows.map((a) => ({
          type: a.relationshipType as RelationshipType,
          table: "account" as const,
          id: a.id,
          name: a.name,
          stage: a.stage,
          sub: a.industry ?? a.location ?? undefined,
          updatedAt: a.updatedAt,
        })),
        ...suppRows.map((s) => ({
          type: "supplier" as RelationshipType,
          table: "supplier" as const,
          id: s.id,
          name: s.name,
          stage: s.stage,
          sub: s.category ?? undefined,
          updatedAt: s.updatedAt,
        })),
        ...invRows.map((i) => ({
          type: "investor" as RelationshipType,
          table: "investor" as const,
          id: i.id,
          name: i.name,
          stage: i.stage,
          sub: i.firm ?? undefined,
          updatedAt: i.updatedAt,
        })),
      ].map((x) => ({ ...x, isArchived: isArchivedStage(x.type, x.stage) }));
      return items.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
    }),

    create: adminWrite
      .input(
        z.object({
          type: z.enum(REL_TYPES),
          name: z.string().trim().min(1).max(255),
          stage: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        if (input.type === "supplier") {
          await getDb()
            .insert(suppliers)
            .values({ name: input.name, stage: (input.stage ?? "contacting") as (typeof SUPPLIER_STAGES)[number] });
        } else if (input.type === "investor") {
          await getDb()
            .insert(investors)
            .values({ name: input.name, stage: (input.stage ?? "contacted") as (typeof INVESTOR_STAGES)[number] });
        } else {
          await getDb()
            .insert(accounts)
            .values({
              name: input.name,
              relationshipType: input.type,
              stage: (input.stage ?? "prospect") as (typeof ACCOUNT_STAGES)[number],
            });
        }
      }),

    /** 推进/归档/恢复：直接设置某关系的阶段（终态=归档，非终态=进行中） */
    setStage: adminWrite
      .input(
        z.object({
          type: z.enum(REL_TYPES),
          id: z.number().int().positive(),
          stage: z.string().min(1).max(32),
        }),
      )
      .mutation(async ({ input }) => {
        if (input.type === "supplier") {
          await getDb()
            .update(suppliers)
            .set({ stage: input.stage as (typeof SUPPLIER_STAGES)[number] })
            .where(eq(suppliers.id, input.id));
        } else if (input.type === "investor") {
          await getDb()
            .update(investors)
            .set({ stage: input.stage as (typeof INVESTOR_STAGES)[number] })
            .where(eq(investors.id, input.id));
        } else {
          await getDb()
            .update(accounts)
            .set({ stage: input.stage as (typeof ACCOUNT_STAGES)[number] })
            .where(eq(accounts.id, input.id));
        }
      }),
  }),

  /** 投资人/基金（融资侧；每轮独立，round 标记轮次） */
  investor: createRouter({
    list: authedQuery.query(() => getDb().select().from(investors).orderBy(asc(investors.name))),

    update: adminWrite
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            name: z.string().min(1).max(255).optional(),
            firm: z.string().max(255).nullish(),
            round: z.string().max(32).nullish(),
            stage: z.enum(INVESTOR_STAGES).optional(),
            contactName: z.string().max(120).nullish(),
            contactTitle: z.string().max(120).nullish(),
            contactEmail: z.string().max(255).nullish(),
            emailKind: z.string().max(16).nullish(),
            contactLinkedin: z.string().max(500).nullish(),
            firstContactAt: d.nullish(),
            lastContactAt: d.nullish(),
            nextAction: z.string().max(500).nullish(),
            progressNote: z.string().nullish(),
            referral: z.string().max(255).nullish(),
            tags: z.string().max(500).nullish(),
            memo: z.string().nullish(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const p = input.patch;
        const set: Partial<typeof investors.$inferInsert> = {};
        if (p.name !== undefined) set.name = p.name;
        if (p.firm !== undefined) set.firm = p.firm;
        if (p.round !== undefined) set.round = p.round;
        if (p.stage !== undefined) set.stage = p.stage;
        if (p.contactName !== undefined) set.contactName = p.contactName;
        if (p.contactTitle !== undefined) set.contactTitle = p.contactTitle;
        if (p.contactEmail !== undefined) set.contactEmail = p.contactEmail;
        if (p.emailKind !== undefined) set.emailKind = p.emailKind;
        if (p.contactLinkedin !== undefined) set.contactLinkedin = p.contactLinkedin;
        if (p.firstContactAt !== undefined) set.firstContactAt = p.firstContactAt;
        if (p.lastContactAt !== undefined) set.lastContactAt = p.lastContactAt;
        if (p.nextAction !== undefined) set.nextAction = p.nextAction;
        if (p.progressNote !== undefined) set.progressNote = p.progressNote;
        if (p.referral !== undefined) set.referral = p.referral;
        if (p.tags !== undefined) set.tags = p.tags;
        if (p.memo !== undefined) set.memo = p.memo;
        await getDb().update(investors).set(set).where(eq(investors.id, input.id));
      }),
  }),

  /** 情报：公司档案（公司库主表 + 融资事件子表，界面一体化） */
  intel: createRouter({
    companies: authedQuery.query(() =>
      getDb()
        .select({
          id: companyLibrary.id,
          name: companyLibrary.name,
          nameNormalized: companyLibrary.nameNormalized,
          domain: companyLibrary.domain,
          industries: companyLibrary.industries,
          hq: companyLibrary.hq,
          foundedYear: companyLibrary.foundedYear,
          employeesBucket: companyLibrary.employeesBucket,
          totalFundingUsd: companyLibrary.totalFundingUsd,
          roundCount: companyLibrary.roundCount,
          lastFundingDate: companyLibrary.lastFundingDate,
          lastFundingType: companyLibrary.lastFundingType,
          ipoStatus: companyLibrary.ipoStatus,
          acquiredBy: companyLibrary.acquiredBy,
          acquiredPrice: companyLibrary.acquiredPrice,
          acquiredDate: companyLibrary.acquiredDate,
          cbUrl: companyLibrary.cbUrl,
          enzymeTag: companyLibrary.enzymeTag,
          sliceTags: companyLibrary.sliceTags,
          snapshotDate: companyLibrary.snapshotDate,
          source: companyLibrary.source,
          /** 列表用简介（截断 200 字，避免整表传输过大；详情抽屉仍取全文） */
          descriptionBrief: sql<string | null>`LEFT(${companyLibrary.description}, 200)`,
        })
        .from(companyLibrary)
        .orderBy(asc(companyLibrary.name)),
    ),

    company: authedQuery
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        const [row] = await getDb().select().from(companyLibrary).where(eq(companyLibrary.id, input.id)).limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "公司不存在" });
        return row;
      }),

    /** 某公司的全部融资轮次（时间线） */
    companyFunding: authedQuery
      .input(z.object({ companyId: z.number().int().positive() }))
      .query(({ input }) =>
        getDb()
          .select()
          .from(fundingEvents)
          .where(eq(fundingEvents.companyId, input.companyId))
          .orderBy(desc(fundingEvents.announcedDate)),
      ),

    /** 全部融资事件（按需在页面侧筛选） */
    funding: authedQuery.query(() =>
      getDb().select().from(fundingEvents).orderBy(desc(fundingEvents.announcedDate)),
    ),
  }),

  /** 跟进记录：entityType+entityId 挂回 accounts/suppliers/investors/contacts 四张表 */
  followup: createRouter({
    /** 全部跟进，按日期倒序（各模块跟进页/看板最近跟进共用） */
    list: authedQuery.query(() =>
      getDb().select().from(followups).orderBy(desc(followups.followDate), desc(followups.id)),
    ),

    create: adminWrite
      .input(
        z.object({
          entityType: z.enum(FOLLOWUP_ENTITY_TYPES),
          entityId: z.number().int().positive(),
          title: z.string().trim().min(1).max(200),
          followDate: d,
          note: z.string().max(2000).nullish(),
        }),
      )
      .mutation(async ({ input }) => {
        const [res] = await getDb().insert(followups).values({
          entityType: input.entityType,
          entityId: input.entityId,
          title: input.title,
          followDate: input.followDate,
          note: input.note ?? null,
        });
        return { id: Number(res.insertId) };
      }),

    update: adminWrite
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            title: z.string().trim().min(1).max(200).optional(),
            followDate: d.optional(),
            note: z.string().max(2000).nullish(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const set: Partial<typeof followups.$inferInsert> = {};
        if (input.patch.title !== undefined) set.title = input.patch.title;
        if (input.patch.followDate !== undefined) set.followDate = input.patch.followDate;
        if (input.patch.note !== undefined) set.note = input.patch.note ?? null;
        await getDb().update(followups).set(set).where(eq(followups.id, input.id));
        return { ok: true };
      }),

    delete: adminWrite.input(idInput).mutation(async ({ input }) => {
      await getDb().delete(followups).where(eq(followups.id, input.id));
      return { ok: true };
    }),
  }),
});
